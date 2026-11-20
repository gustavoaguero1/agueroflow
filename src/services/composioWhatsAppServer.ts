import { Composio } from '@composio/core';
import fs from 'fs';
import {
  ComposioAuthConfigSummary,
  ComposioConnectionSummary,
} from '../types/whatsappComposio';

let cachedClient: Composio | null = null;
let cachedApiKey: string | undefined = undefined;
const toolSchemaCache = new Map<string, Record<string, any>>();

export function isComposioConfigured(): boolean {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  return Boolean(key && key !== 'MY_COMPOSIO_API_KEY');
}

export function getComposioClient(): Composio | null {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key || key === 'MY_COMPOSIO_API_KEY') {
    return null;
  }
  if (!cachedClient || cachedApiKey !== key) {
    cachedClient = new Composio({ apiKey: key });
    cachedApiKey = key;
  }
  return cachedClient;
}

export function normalizeWhatsAppPhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  // Default Brazil country code if user typed DDD + 8/9 digits without 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function formatWhatsAppPhoneDisplay(raw: string): string {
  const digits = normalizeWhatsAppPhone(raw);
  if (!digits) return raw || '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const body = digits.slice(4);
    if (body.length === 9) {
      return `+55 ${ddd} ${body.slice(0, 5)}-${body.slice(5)}`;
    }
    return `+55 ${ddd} ${body.slice(0, 4)}-${body.slice(4)}`;
  }
  return `+${digits}`;
}

function mapConnectedAccount(item: any): ComposioConnectionSummary {
  const stateVal = item?.state?.val || item?.data || {};
  return {
    id: item?.id || '',
    userId: item?.userId || item?.entityId || 'default',
    status: item?.status || 'UNKNOWN',
    toolkitSlug: item?.toolkit?.slug || 'whatsapp',
    authConfigId: item?.authConfig?.id || item?.authConfigId,
    isDisabled: Boolean(item?.isDisabled),
    createdAt: item?.createdAt,
    updatedAt: item?.updatedAt,
    phoneNumberId:
      stateVal?.phone_number_id ||
      stateVal?.phoneNumberId ||
      item?.phone_number_id ||
      undefined,
    wabaId:
      stateVal?.waba_id ||
      stateVal?.whatsapp_business_account_id ||
      item?.waba_id ||
      undefined,
  };
}

export async function listWhatsAppConnectedAccounts(userId?: string): Promise<{
  accounts: ComposioConnectionSummary[];
  authConfigs: ComposioAuthConfigSummary[];
  error?: string;
}> {
  const composio = getComposioClient();
  if (!composio) {
    return {
      accounts: [],
      authConfigs: [],
      error: 'COMPOSIO_API_KEY não configurada no servidor.',
    };
  }

  try {
    const [accountsRes, authConfigsRes] = await Promise.all([
      composio.connectedAccounts.list({
        toolkitSlugs: ['whatsapp'],
        ...(userId ? { userIds: [userId] } : {}),
      }),
      composio.authConfigs.list({ toolkit: 'whatsapp' }).catch(() => ({ items: [] as any[] })),
    ]);

    const accounts = Array.isArray(accountsRes?.items)
      ? accountsRes.items.map(mapConnectedAccount)
      : [];

    const authConfigs: ComposioAuthConfigSummary[] = Array.isArray((authConfigsRes as any)?.items)
      ? (authConfigsRes as any).items.map((ac: any) => ({
          id: ac.id,
          name: ac.name || 'WhatsApp Auth Config',
          toolkitSlug: ac.toolkit?.slug || 'whatsapp',
          authScheme: ac.authScheme,
        }))
      : [];

    return { accounts, authConfigs };
  } catch (err: any) {
    return {
      accounts: [],
      authConfigs: [],
      error: err?.message || 'Falha ao consultar contas conectadas no Composio.',
    };
  }
}

export async function getConnectedAccountDetails(connectedAccountId: string): Promise<{
  account: ComposioConnectionSummary | null;
  raw?: any;
  error?: string;
}> {
  const composio = getComposioClient();
  if (!composio) {
    return { account: null, error: 'COMPOSIO_API_KEY não configurada no servidor.' };
  }
  if (!connectedAccountId) {
    return { account: null, error: 'Connected Account ID não informado.' };
  }

  try {
    const account = await composio.connectedAccounts.get(connectedAccountId);
    return {
      account: mapConnectedAccount(account),
      raw: account,
    };
  } catch (err: any) {
    return {
      account: null,
      error: err?.message || 'Não foi possível validar o Connected Account ID no Composio.',
    };
  }
}

export async function createWhatsAppLinkUrl(params: {
  userId: string;
  authConfigId?: string;
  callbackUrl?: string;
}): Promise<{ redirectUrl?: string; connectionRequestId?: string; authConfigIdUsed?: string; error?: string }> {
  const composio = getComposioClient();
  if (!composio) {
    return { error: 'COMPOSIO_API_KEY não configurada nas variáveis de ambiente do servidor.' };
  }

  try {
    let authConfigId = params.authConfigId?.trim() || process.env.COMPOSIO_WHATSAPP_AUTH_CONFIG_ID?.trim();

    if (!authConfigId) {
      const configsRes = await composio.authConfigs.list({ toolkit: 'whatsapp' });
      const firstConfig = configsRes?.items?.[0];
      authConfigId = firstConfig?.id;
    }

    if (!authConfigId) {
      return {
        error:
          'Nenhum Auth Config do toolkit "whatsapp" foi encontrado. Crie uma Auth Config de WhatsApp no painel do Composio ou informe o Auth Config ID.',
      };
    }

    const linkRequest = await composio.connectedAccounts.link(
      params.userId || 'aguero_inox_default',
      authConfigId,
      params.callbackUrl ? { callbackUrl: params.callbackUrl } : undefined
    );

    return {
      redirectUrl: linkRequest.redirectUrl || undefined,
      connectionRequestId: linkRequest.id,
      authConfigIdUsed: authConfigId,
    };
  } catch (err: any) {
    return {
      error: err?.message || 'Erro ao gerar link de conexão WhatsApp no Composio.',
    };
  }
}

async function getToolProperties(composio: Composio, slug: string): Promise<Record<string, any> | null> {
  if (toolSchemaCache.has(slug)) {
    return toolSchemaCache.get(slug)!;
  }
  try {
    const tool = await composio.tools.getRawComposioToolBySlug(slug);
    const props = (tool?.inputParameters as any)?.properties || null;
    if (props) {
      toolSchemaCache.set(slug, props);
    }
    return props;
  } catch {
    return null;
  }
}

export async function executeWhatsAppSendText(params: {
  connectedAccountId: string;
  userId?: string;
  phoneNumberId?: string;
  toNumber: string;
  text: string;
}): Promise<{
  success: boolean;
  executionId?: string;
  externalMessageId?: string;
  data?: any;
  error?: string;
}> {
  const composio = getComposioClient();
  if (!composio) {
    return {
      success: false,
      error: 'COMPOSIO_API_KEY não configurada no servidor (Secrets / .env).',
    };
  }

  if (!params.connectedAccountId) {
    return {
      success: false,
      error: 'Composio Connected Account ID (ca_...) não está configurado.',
    };
  }

  const normalizedPhone = normalizeWhatsAppPhone(params.toNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'Número de WhatsApp de destino inválido.' };
  }

  try {
    // Inspect schema dynamically to match exact parameter names in active Composio WhatsApp version
    const props = await getToolProperties(composio, 'WHATSAPP_SEND_MESSAGE');
    const args: Record<string, unknown> = {};

    if (props) {
      if ('to_number' in props) args.to_number = normalizedPhone;
      else if ('to' in props) args.to = normalizedPhone;
      else if ('recipient_phone_number' in props) args.recipient_phone_number = normalizedPhone;
      else if ('phone_number' in props) args.phone_number = normalizedPhone;
      else args.to_number = normalizedPhone;

      if ('text' in props) args.text = params.text;
      else if ('message' in props) args.message = params.text;
      else if ('body' in props) args.body = params.text;
      else args.text = params.text;

      if (params.phoneNumberId) {
        if ('phone_number_id' in props) args.phone_number_id = params.phoneNumberId;
        else if ('phoneNumberId' in props) args.phoneNumberId = params.phoneNumberId;
      }
    } else {
      args.to_number = normalizedPhone;
      args.text = params.text;
      if (params.phoneNumberId) {
        args.phone_number_id = params.phoneNumberId;
      }
    }

    const result: any = await composio.tools.execute('WHATSAPP_SEND_MESSAGE', {
      userId: params.userId || 'default',
      connectedAccountId: params.connectedAccountId,
      dangerouslySkipVersionCheck: true,
      arguments: args,
    });

    if (result && result.successful === false) {
      return {
        success: false,
        error: result.error || 'Composio retornou falha ao executar WHATSAPP_SEND_MESSAGE.',
        data: result.data,
      };
    }

    const externalMessageId =
      result?.data?.messages?.[0]?.id ||
      result?.data?.message_id ||
      result?.data?.id ||
      undefined;

    return {
      success: true,
      executionId: result?.logId || result?.executionId || `comp_${Date.now()}`,
      externalMessageId,
      data: result?.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Erro ao enviar mensagem via Composio WhatsApp.',
    };
  }
}

export async function executeWhatsAppSendTemplate(params: {
  connectedAccountId: string;
  userId?: string;
  phoneNumberId?: string;
  toNumber: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
}): Promise<{
  success: boolean;
  executionId?: string;
  externalMessageId?: string;
  data?: any;
  error?: string;
}> {
  const composio = getComposioClient();
  if (!composio) {
    return {
      success: false,
      error: 'COMPOSIO_API_KEY não configurada no servidor (Secrets / .env).',
    };
  }

  const normalizedPhone = normalizeWhatsAppPhone(params.toNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'Número de WhatsApp de destino inválido.' };
  }

  try {
    const props = await getToolProperties(composio, 'WHATSAPP_SEND_TEMPLATE_MESSAGE');
    const args: Record<string, unknown> = {};

    if (props) {
      if ('to_number' in props) args.to_number = normalizedPhone;
      else if ('to' in props) args.to = normalizedPhone;
      else args.to_number = normalizedPhone;

      if ('template_name' in props) args.template_name = params.templateName;
      else if ('name' in props) args.name = params.templateName;
      else args.template_name = params.templateName;

      if ('language_code' in props) args.language_code = params.languageCode || 'pt_BR';
      else if ('language' in props) args.language = params.languageCode || 'pt_BR';

      if (params.phoneNumberId && 'phone_number_id' in props) {
        args.phone_number_id = params.phoneNumberId;
      }
      if (params.components && 'components' in props) {
        args.components = params.components;
      }
    } else {
      args.to_number = normalizedPhone;
      args.template_name = params.templateName;
      args.language_code = params.languageCode || 'pt_BR';
      if (params.phoneNumberId) args.phone_number_id = params.phoneNumberId;
      if (params.components) args.components = params.components;
    }

    const result: any = await composio.tools.execute('WHATSAPP_SEND_TEMPLATE_MESSAGE', {
      userId: params.userId || 'default',
      connectedAccountId: params.connectedAccountId,
      dangerouslySkipVersionCheck: true,
      arguments: args,
    });

    if (result && result.successful === false) {
      return {
        success: false,
        error: result.error || 'Falha ao enviar template via Composio WhatsApp.',
        data: result.data,
      };
    }

    return {
      success: true,
      executionId: result?.logId || `comp_tpl_${Date.now()}`,
      externalMessageId: result?.data?.messages?.[0]?.id || result?.data?.id,
      data: result?.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Erro ao enviar template WhatsApp via Composio.',
    };
  }
}

export async function executeWhatsAppDownloadMedia(params: {
  connectedAccountId: string;
  userId?: string;
  mediaId: string;
}): Promise<{ base64?: string; mimeType?: string; error?: string }> {
  const composio = getComposioClient();
  if (!composio || !params.connectedAccountId || !params.mediaId) {
    return { error: 'Parâmetros ou credenciais Composio insuficientes para baixar mídia.' };
  }

  try {
    const props = await getToolProperties(composio, 'WHATSAPP_DOWNLOAD_MEDIA');
    const args: Record<string, unknown> = {};
    if (props && 'media_id' in props) args.media_id = params.mediaId;
    else if (props && 'id' in props) args.id = params.mediaId;
    else args.media_id = params.mediaId;

    const result: any = await composio.tools.execute('WHATSAPP_DOWNLOAD_MEDIA', {
      userId: params.userId || 'default',
      connectedAccountId: params.connectedAccountId,
      dangerouslySkipVersionCheck: true,
      arguments: args,
    });

    const data = result?.data || {};
    const mimeType = data.mime_type || data.mimeType || 'image/jpeg';

    if (typeof data.base64 === 'string' && data.base64.length > 0) {
      return { base64: data.base64, mimeType };
    }
    if (typeof data.content === 'string' && data.content.length > 0) {
      return { base64: data.content, mimeType };
    }
    if (typeof data.file === 'string' && fs.existsSync(data.file)) {
      const buf = fs.readFileSync(data.file);
      return { base64: buf.toString('base64'), mimeType };
    }
    if (typeof data.local_file_path === 'string' && fs.existsSync(data.local_file_path)) {
      const buf = fs.readFileSync(data.local_file_path);
      return { base64: buf.toString('base64'), mimeType };
    }
    if (typeof data.url === 'string' && data.url.startsWith('http')) {
      const imgRes = await fetch(data.url);
      if (imgRes.ok) {
        const arr = await imgRes.arrayBuffer();
        return { base64: Buffer.from(arr).toString('base64'), mimeType };
      }
    }

    return { error: 'Composio não retornou bytes ou caminho de mídia utilizável.' };
  } catch (err: any) {
    return { error: err?.message || 'Erro ao baixar mídia via Composio.' };
  }
}

export async function subscribeWhatsAppRealtimeTriggers(
  onPayload: (incoming: any) => Promise<void> | void
): Promise<{ subscribed: boolean; error?: string }> {
  const composio = getComposioClient();
  if (!composio) {
    return { subscribed: false, error: 'COMPOSIO_API_KEY não configurada.' };
  }

  let subError: string | undefined;
  try {
    await composio.triggers.subscribe(
      async (data) => {
        try {
          await onPayload(data);
        } catch (err: any) {
          console.warn('⚠️ [Composio Trigger Handler]:', err?.message || err);
        }
      },
      { toolkits: ['whatsapp'] },
      (errData) => {
        subError = typeof errData?.message === 'string' ? errData.message : JSON.stringify(errData);
        console.warn('⚠️ [Composio Realtime Subscription]:', subError);
      }
    );

    if (subError) {
      return { subscribed: false, error: subError };
    }
    return { subscribed: true };
  } catch (err: any) {
    return {
      subscribed: false,
      error: err?.message || 'Falha ao iniciar assinatura em tempo real do Composio.',
    };
  }
}
