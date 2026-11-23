import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PurchaseRequisition,
  PurchaseQuotationMap,
  PurchaseOrder,
  PurchasingSupplier,
  MaterialReceiptRecord,
  MonthlySavingsReport,
} from '../types/purchasing';
import { apiFetch } from '../apiAuthFetch';

// Helper to remove undefined fields for Firestore
function cleanFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = cleanFirestoreData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as Partial<T>;
}

// ---------------------------------------------------------------------------
// 1. REQUISITIONS (RC)
// ---------------------------------------------------------------------------

export async function getPurchaseRequisitions(organizationId: string): Promise<PurchaseRequisition[]> {
  try {
    const q = query(
      collection(db, 'purchasing_requisitions'),
      where('organizationId', '==', organizationId)
    );
    const snap = await getDocs(q);
    const list: PurchaseRequisition[] = [];
    snap.forEach((d) => list.push(d.data() as PurchaseRequisition));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Erro ao carregar requisições de compra:', err);
    return [];
  }
}

export async function savePurchaseRequisition(req: PurchaseRequisition): Promise<void> {
  const docRef = doc(db, 'purchasing_requisitions', req.id);
  await setDoc(docRef, cleanFirestoreData(req), { merge: true });
}

export async function updateRequisitionStatus(
  id: string,
  status: PurchaseRequisition['status']
): Promise<void> {
  const docRef = doc(db, 'purchasing_requisitions', id);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// 2. QUOTATION MAPS (MAPA COMPARATIVO 3-BID)
// ---------------------------------------------------------------------------

export async function getPurchaseQuotations(organizationId: string): Promise<PurchaseQuotationMap[]> {
  try {
    const q = query(
      collection(db, 'purchasing_quotations'),
      where('organizationId', '==', organizationId)
    );
    const snap = await getDocs(q);
    const list: PurchaseQuotationMap[] = [];
    snap.forEach((d) => list.push(d.data() as PurchaseQuotationMap));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Erro ao carregar mapas de cotação:', err);
    return [];
  }
}

export async function savePurchaseQuotation(quotation: PurchaseQuotationMap): Promise<void> {
  const docRef = doc(db, 'purchasing_quotations', quotation.id);
  await setDoc(docRef, cleanFirestoreData(quotation), { merge: true });
}

// ---------------------------------------------------------------------------
// 3. PURCHASE ORDERS (OC / ORDENS DE COMPRA)
// ---------------------------------------------------------------------------

export async function getPurchaseOrders(organizationId: string): Promise<PurchaseOrder[]> {
  try {
    const q = query(
      collection(db, 'purchasing_orders'),
      where('organizationId', '==', organizationId)
    );
    const snap = await getDocs(q);
    const list: PurchaseOrder[] = [];
    snap.forEach((d) => list.push(d.data() as PurchaseOrder));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Erro ao carregar ordens de compra:', err);
    return [];
  }
}

export async function savePurchaseOrder(order: PurchaseOrder): Promise<void> {
  const docRef = doc(db, 'purchasing_orders', order.id);
  await setDoc(docRef, cleanFirestoreData(order), { merge: true });
}

export async function updatePurchaseOrderStatus(
  orderId: string,
  status: PurchaseOrder['status'],
  extraData?: Partial<PurchaseOrder>
): Promise<void> {
  const docRef = doc(db, 'purchasing_orders', orderId);
  await updateDoc(docRef, cleanFirestoreData({
    status,
    updatedAt: new Date().toISOString(),
    ...(extraData || {}),
  }));
}

// ---------------------------------------------------------------------------
// 4. SUPPLIERS (FORNECEDORES)
// ---------------------------------------------------------------------------

export async function getPurchasingSuppliers(organizationId: string): Promise<PurchasingSupplier[]> {
  try {
    const q = query(
      collection(db, 'purchasing_suppliers'),
      where('organizationId', '==', organizationId)
    );
    const snap = await getDocs(q);
    const list: PurchasingSupplier[] = [];
    snap.forEach((d) => list.push(d.data() as PurchasingSupplier));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn('Erro ao carregar fornecedores:', err);
    return [];
  }
}

export async function savePurchasingSupplier(supplier: PurchasingSupplier): Promise<void> {
  const docRef = doc(db, 'purchasing_suppliers', supplier.id);
  await setDoc(docRef, cleanFirestoreData(supplier), { merge: true });
}

// ---------------------------------------------------------------------------
// 5. MATERIAL RECEIPT (RECEBIMENTO & INSPEÇÃO DE ENTRADA)
// ---------------------------------------------------------------------------

export async function getMaterialReceipts(organizationId: string): Promise<MaterialReceiptRecord[]> {
  try {
    const q = query(
      collection(db, 'purchasing_receipts'),
      where('organizationId', '==', organizationId)
    );
    const snap = await getDocs(q);
    const list: MaterialReceiptRecord[] = [];
    snap.forEach((d) => list.push(d.data() as MaterialReceiptRecord));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Erro ao carregar recebimentos de materiais:', err);
    return [];
  }
}

export async function saveMaterialReceipt(receipt: MaterialReceiptRecord): Promise<void> {
  const docRef = doc(db, 'purchasing_receipts', receipt.id);
  await setDoc(docRef, cleanFirestoreData(receipt), { merge: true });

  // Update associated purchase order item quantities
  try {
    const orderDocRef = doc(db, 'purchasing_orders', receipt.purchaseOrderId);
    const orderDoc = await getDoc(orderDocRef);
    if (orderDoc.exists()) {
      const orderData = orderDoc.data() as PurchaseOrder;
      let allDelivered = true;
      const updatedItems = orderData.items.map((it) => {
        const matchingReceipt = receipt.itemsReceived.find((r) => r.itemId === it.id);
        const newReceived = matchingReceipt
          ? (it.quantityReceived || 0) + matchingReceipt.quantityReceived
          : it.quantityReceived || 0;

        if (newReceived < it.quantityOrdered) {
          allDelivered = false;
        }

        return {
          ...it,
          quantityReceived: newReceived,
          heatNumber: matchingReceipt?.heatNumber || it.heatNumber,
        };
      });

      await updateDoc(orderDocRef, {
        items: updatedItems,
        status: allDelivered ? 'recebida_total' : 'recebida_parcial',
        receiptDate: receipt.receiptDate,
        invoiceNumber: receipt.invoiceNumber || orderData.invoiceNumber,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Aviso ao atualizar ordem de compra após recebimento:', err);
  }
}

// ---------------------------------------------------------------------------
// 6. EXPORT FORMAL PURCHASE ORDER PDF (OC)
// ---------------------------------------------------------------------------

export function exportPurchaseOrderPdf(order: PurchaseOrder, companyName: string = 'Aguero Inox & Montagens Industriais'): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Bar
  doc.setFillColor(11, 19, 43); // Dark navy
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEM DE COMPRA FORMAL DE FORNECIMENTO', 14, 16);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 210, 255);
  doc.text(`${companyName.toUpperCase()} • DEPARTAMENTO DE COMPRAS & SUPRIMENTOS`, 14, 23);
  doc.text(`Nº DA OC: ${order.code} | EMISSÃO: ${new Date(order.emissionDate).toLocaleDateString('pt-BR')} | STATUS: ${order.status.toUpperCase()}`, 14, 30);

  // Supplier & Billing Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 42, pageWidth - 28, 38, 2, 2, 'FD');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO FORNECEDOR:', 18, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(`Razão Social: ${order.supplierName}`, 18, 56);
  doc.text(`CNPJ: ${order.supplierCnpj || 'Não informado'} | Contato: ${order.supplierContact || 'Comercial'}`, 18, 62);
  doc.text(`E-mail: ${order.supplierEmail || '-'} | Tel: ${order.supplierPhone || '-'}`, 18, 68);

  doc.setFont('helvetica', 'bold');
  doc.text('CONDIÇÕES DE FORNECIMENTO & ENTREGA:', 110, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(`Prazo / Entrega Prometida: ${new Date(order.expectedDeliveryDate).toLocaleDateString('pt-BR')}`, 110, 56);
  doc.text(`Condição de Pagamento: ${order.paymentTerms}`, 110, 62);
  doc.text(`Frete: ${order.freightType} | Local: ${order.deliveryLocation}`, 110, 68);
  doc.text(`Comprador Responsável: ${order.buyerName}`, 110, 74);

  // Table of Items
  const tableData = order.items.map((it, idx) => [
    (idx + 1).toString(),
    it.internalCode || it.manufacturerCode || '-',
    it.description,
    it.brand || '-',
    it.unit,
    it.quantityOrdered.toString(),
    it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    it.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['Item', 'Código', 'Descrição Técnica do Material', 'Marca', 'Und', 'Qtd', 'Unitário (R$)', 'Total (R$)']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  // Total summary box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(pageWidth - 85, finalY + 6, 71, 24, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal dos Itens:', pageWidth - 82, finalY + 12);
  doc.text(order.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, finalY + 12, { align: 'right' });

  doc.text(`Frete (${order.freightType}):`, pageWidth - 82, finalY + 18);
  doc.text(order.freightValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, finalY + 18, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text('TOTAL DO PEDIDO:', pageWidth - 82, finalY + 25);
  doc.setTextColor(2, 132, 199);
  doc.text(order.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, finalY + 25, { align: 'right' });

  // Quality requirements & Observations
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, finalY + 6, pageWidth - 105, 36, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('EXIGÊNCIAS OBRIGATÓRIAS DE QUALIDADE (MTR):', 18, finalY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('1. Todos os materiais devem vir acompanhados de seus Certificados de Corrida (MTR).', 18, finalY + 19);
  doc.text('2. A Nota Fiscal (NF-e) deve conter o número desta Ordem de Compra expressa.', 18, finalY + 25);
  doc.text('3. O recebimento está sujeito a inspeção dimensional e conferência de conformidade.', 18, finalY + 31);
  if (order.notes) {
    doc.text(`Obs: ${order.notes.slice(0, 70)}`, 18, finalY + 37);
  }

  // Signatures
  const signY = finalY + 54;
  if (signY < 270) {
    doc.setDrawColor(148, 163, 184);
    doc.line(18, signY, 90, signY);
    doc.line(120, signY, 192, signY);

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Comprador Autorizado / Suprimentos', 24, signY + 5);
    doc.text('De Acordo / Confirmação do Fornecedor', 126, signY + 5);
  }

  doc.save(`${order.code}_${order.supplierName.replace(/\s+/g, '_').slice(0, 20)}.pdf`);
}


// ---------------------------------------------------------------------------
// 7. AI MARKET PRICE BENCHMARK & MONTHLY SAVINGS
// ---------------------------------------------------------------------------

export async function fetchAiMarketBenchmark(
  items?: any[],
  totalSpend?: number
): Promise<MonthlySavingsReport> {
  try {
    const res = await apiFetch('/api/ai/market-benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, totalSpend }),
    });

    if (!res.ok) {
      throw new Error(`Falha no benchmark de mercado (HTTP ${res.status})`);
    }

    const json = await res.json();
    return json.data;
  } catch (err) {
    console.warn('Erro ao consultar benchmark de mercado via IA, usando valores calculados:', err);
    const spend = totalSpend && totalSpend > 0 ? totalSpend : 0;
    return {
      month: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date()),
      totalMonthlySpend: spend,
      estimatedMarketSpend: spend,
      totalSavingsAmount: 0, // sem dado real não há economia apurada
      savingsPercentage: 0,
      isEstimate: true,
      topSavedItems: [
        {
          id: 'bm_1',
          materialName: 'Tubo Inox 304 com costura SCH 10 2" DN50 ASTM A312',
          category: 'Tubulações & Conexões',
          unit: 'M',
          averagePaidPrice: 85.50,
          currentMarketPrice: 94.80,
          priceDeltaPercent: -9.81,
          trend: 'estavel',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — Aperam Tubos / Marcegaglia Brasil',
        },
        {
          id: 'bm_2',
          materialName: 'Válvula Borboleta Wafer Inox 304 EPDM 2" 150#',
          category: 'Válvulas & Instrumentação',
          unit: 'UN',
          averagePaidPrice: 380.00,
          currentMarketPrice: 425.00,
          priceDeltaPercent: -10.59,
          trend: 'alta',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — Bray Controls / MGA Válvulas',
        },
        {
          id: 'bm_3',
          materialName: 'Flange Pescoço WN RF Inox 304 2" 150# SCH 10',
          category: 'Tubulações & Conexões',
          unit: 'UN',
          averagePaidPrice: 72.00,
          currentMarketPrice: 81.50,
          priceDeltaPercent: -11.66,
          trend: 'estavel',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — Conforja / Tenaris Brasil',
        },
        {
          id: 'bm_4',
          materialName: 'Chapa Aço Inox 304 2B 3.0mm (1200 x 3000mm)',
          category: 'Aço Inox (Chapas & Barras)',
          unit: 'KG',
          averagePaidPrice: 31.80,
          currentMarketPrice: 34.90,
          priceDeltaPercent: -8.88,
          trend: 'alta',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — Aperam / ArcelorMittal Inox Brasil',
        },
        {
          id: 'bm_5',
          materialName: 'Curva 90º Raio Longo Inox 304 SCH 10 2" BW',
          category: 'Tubulações & Conexões',
          unit: 'UN',
          averagePaidPrice: 45.00,
          currentMarketPrice: 49.50,
          priceDeltaPercent: -9.09,
          trend: 'queda',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — Conexões forjadas nacionais com MTR rastreável',
        },
        {
          id: 'bm_6',
          materialName: 'Arame de Solda MIG Inox ER308L 1.2mm Carretel 15kg',
          category: 'Consumíveis & Gases de Solda',
          unit: 'KG',
          averagePaidPrice: 68.00,
          currentMarketPrice: 75.20,
          priceDeltaPercent: -9.57,
          trend: 'estavel',
          lastUpdated: new Date().toISOString(),
          sourceNotes: 'Estimativa — ESAB / Lincoln Electric Brasil',
        },
      ],
      aiMarketAnalysisSummary: 'Valores de referência estimados (serviço de benchmark indisponível); não representam cotação nem economia real.',
      commodityIndices: {
        nickelLmeUsdTon: 16420,
        dollarPtaxBrl: 5.72,
        stainlessSurchargeTrend: 'Moderada / Estável (+1.2% previsto para próximo mês)',
      },
    };
  }
}
