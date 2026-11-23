import { apiFetch } from '../apiAuthFetch';
export interface ParsedDocumentData {
  nrCode: string;
  title: string;
  expirationDate: string;
  issueDate: string;
  certificateNumber?: string;
  issuingEntity?: string;
  workerName?: string;
  confidence: number;
  summary: string;
}

export interface ParseDocumentResponse {
  success: boolean;
  source: 'gemini-ai' | 'cache' | 'filename_heuristic' | 'heuristic' | 'heuristic_fallback';
  data: ParsedDocumentData;
  error?: string;
}

// In-memory cache to prevent duplicate AI calls for the exact same document
const scanCache = new Map<string, ParseDocumentResponse>();

function getCacheKey(fileName: string, fileBase64: string): string {
  // Simple fast signature: name + size + tail slice
  const sample = fileBase64.length > 200 ? fileBase64.slice(-120) : fileBase64;
  return `${fileName}_${fileBase64.length}_${sample}`;
}

/**
 * Detecção instantânea e gratuita a partir do nome do arquivo (Zero custo de tokens).
 * Útil quando o arquivo já vem com nomenclatura como 'NR35_Validade_2026_10_15.pdf'.
 */
export function quickDetectFromFilename(fileName: string): ParsedDocumentData | null {
  if (!fileName) return null;
  const upper = fileName.toUpperCase();
  let nrCode = '';
  let title = '';

  if (upper.includes('NR-35') || upper.includes('NR35') || upper.includes('ALTURA')) {
    nrCode = 'NR-35';
    title = 'Trabalho em Altura (NR-35)';
  } else if (upper.includes('NR-33') || upper.includes('NR33') || upper.includes('CONFINADO')) {
    nrCode = 'NR-33';
    title = 'Espaço Confinado (NR-33)';
  } else if (upper.includes('NR-10') || upper.includes('NR10') || upper.includes('ELETRIC')) {
    nrCode = 'NR-10';
    title = 'Segurança em Instalações Elétricas (NR-10)';
  } else if (upper.includes('NR-12') || upper.includes('NR12') || upper.includes('MAQUINA')) {
    nrCode = 'NR-12';
    title = 'Segurança em Máquinas e Equipamentos (NR-12)';
  } else if (upper.includes('NR-18') || upper.includes('NR18') || upper.includes('CONSTRU')) {
    nrCode = 'NR-18';
    title = 'Condições e Meio Ambiente na Construção (NR-18)';
  } else if (upper.includes('NR-06') || upper.includes('NR06') || upper.includes('NR-6') || upper.includes('NR6') || upper.includes('EPI')) {
    nrCode = 'NR-06';
    title = 'Equipamentos de Proteção Individual (NR-06)';
  } else if (upper.includes('NR-20') || upper.includes('NR20') || upper.includes('INFLAM')) {
    nrCode = 'NR-20';
    title = 'Segurança com Inflamáveis e Combustíveis (NR-20)';
  } else if (upper.includes('ASO') || upper.includes('ATESTADO') || upper.includes('SAUDE') || upper.includes('MEDIC')) {
    nrCode = 'ASO';
    title = 'Atestado de Saúde Ocupacional (ASO)';
  }

  // Look for dates
  let expirationDate = '';
  const dateIso = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (dateIso) {
    expirationDate = `${dateIso[1]}-${dateIso[2]}-${dateIso[3]}`;
  } else {
    const dateBr = fileName.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
    if (dateBr) {
      expirationDate = `${dateBr[3]}-${dateBr[2]}-${dateBr[1]}`;
    }
  }

  if (nrCode || expirationDate) {
    return {
      nrCode: nrCode || 'Outra',
      title: title || 'Certificação Técnica',
      expirationDate,
      issueDate: '',
      certificateNumber: '',
      issuingEntity: '',
      workerName: '',
      confidence: 70,
      summary: `Detectado instantaneamente do nome do arquivo (Zero IA/Tokens): ${nrCode || 'Certificado'} • Validade: ${expirationDate || 'A verificar'}`,
    };
  }

  return null;
}

/**
 * Otimiza imagens no cliente antes de enviar à IA, reduzindo tamanho em até 90%
 * (reduz consumo de tokens e economiza uso de banda).
 */
export async function optimizeImageForAi(dataUrl: string, maxWidth = 1200): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl; // Not an image (e.g. PDF), return as is
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxWidth) {
        resolve(dataUrl);
        return;
      }

      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Export as efficient JPEG with high readability
      const optimized = canvas.toDataURL('image/jpeg', 0.85);
      resolve(optimized);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Envia o documento para o endpoint de IA com cache e otimização inteligente para custo mínimo.
 */
export async function parseRegulatoryDocumentWithAI(
  fileBase64: string,
  fileName: string,
  mimeType: string,
  forceFresh = false
): Promise<ParseDocumentResponse> {
  const cacheKey = getCacheKey(fileName, fileBase64);

  // 1. Economia por Cache: se já foi lido nesta sessão, retorna direto com 0 chamadas de API
  if (!forceFresh && scanCache.has(cacheKey)) {
    const cached = scanCache.get(cacheKey)!;
    return {
      ...cached,
      source: 'cache',
      data: {
        ...cached.data,
        summary: `[Cache Local - Zero Custo] ${cached.data.summary}`,
      },
    };
  }

  try {
    // 2. Otimização de imagem para reduzir drasticamente tokens de entrada
    const payloadBase64 = fileBase64.startsWith('data:image/')
      ? await optimizeImageForAi(fileBase64)
      : fileBase64;

    const res = await apiFetch('/api/ai/parse-nr-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileBase64: payloadBase64,
        fileName,
        mimeType,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || `Falha na requisição: ${res.status}`);
    }

    const json = (await res.json()) as ParseDocumentResponse;
    if (json.success && json.data) {
      scanCache.set(cacheKey, json);
    }
    return json;
  } catch (err: any) {
    console.error('Erro ao invocar parse de documento com IA:', err);
    // Fallback gratuito por heurística de nome
    const fallback = quickDetectFromFilename(fileName);
    if (fallback) {
      return {
        success: true,
        source: 'filename_heuristic',
        data: fallback,
      };
    }

    return {
      success: false,
      source: 'heuristic_fallback',
      error: err?.message || 'Falha ao conectar com o serviço de IA.',
      data: {
        nrCode: 'Outra',
        title: 'Certificação Técnica',
        expirationDate: '',
        issueDate: '',
        certificateNumber: '',
        issuingEntity: '',
        workerName: '',
        confidence: 0,
        summary: 'Não foi possível ler o documento automaticamente. Preenchimento manual mantido.',
      },
    };
  }
}
