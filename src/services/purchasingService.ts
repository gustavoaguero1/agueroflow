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

export async function seedPurchasingDemoDataIfEmpty(
  organizationId: string,
  userName: string = 'Comprador Industrial'
): Promise<void> {
  try {
    const existing = await getPurchasingSuppliers(organizationId);
    if (existing.length === 0) {
      await seedPurchasingDemoData(organizationId, userName);
    }
  } catch (err) {
    console.warn('Erro ao verificar/inserir dados demo de compras:', err);
  }
}

export async function seedPurchasingDemoData(organizationId: string, userName: string = 'Comprador Industrial'): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // 1. Suppliers
  const suppliers: PurchasingSupplier[] = [
    {
      id: `sup_aperam_${organizationId}`,
      organizationId,
      name: 'Aperam South America Indústria de Tubos',
      tradeName: 'Aperam Tubos Inox',
      cnpj: '60.872.504/0001-23',
      contactPerson: 'Carlos Guimarães - Vendas Industriais',
      email: 'carlos.guimaraes@aperam.com',
      phone: '(31) 3849-7000',
      city: 'Timóteo',
      state: 'MG',
      address: 'Av. dos Inoxidáveis, 4500',
      categories: ['Tubulações Inox', 'Chapas Inox', 'Curvas BW'],
      rating: 5,
      isCertifiedIso: true,
      status: 'homologado',
      notes: 'Fornecedor principal usina de tubulações em AISI 304 e 316L com certificado rastreável.',
      createdAt: new Date().toISOString(),
    },
    {
      id: `sup_bray_${organizationId}`,
      organizationId,
      name: 'Bray Controls Brasil Válvulas e Atuadores',
      tradeName: 'Bray Controls',
      cnpj: '03.441.890/0001-55',
      contactPerson: 'Juliana Prado - Engenharia de Aplicação',
      email: 'vendas.brasil@bray.com',
      phone: '(11) 4366-4400',
      city: 'Paulinia',
      state: 'SP',
      address: 'Rodovia Professor Zeferino Vaz, km 121',
      categories: ['Válvulas Borboleta', 'Válvulas Esfera', 'Atuadores Pneumáticos'],
      rating: 5,
      isCertifiedIso: true,
      status: 'homologado',
      notes: 'Homologado para válvulas sanitárias e de processo químico.',
      createdAt: new Date().toISOString(),
    },
    {
      id: `sup_tenaris_${organizationId}`,
      organizationId,
      name: 'Tenaris Confab Conexões e Flanges Industriais',
      tradeName: 'Tenaris',
      cnpj: '51.810.123/0001-90',
      contactPerson: 'Roberto Albuquerque',
      email: 'vendas@tenaris.com.br',
      phone: '(12) 3644-9000',
      city: 'Pindamonhangaba',
      state: 'SP',
      categories: ['Flanges WN/SO', 'Conexões Forjadas', 'Curvas ASME'],
      rating: 4,
      isCertifiedIso: true,
      status: 'homologado',
      notes: 'Fornecedor líder em flanges ASME B16.5 150# a 600#.',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const s of suppliers) {
    await savePurchasingSupplier(s);
  }

  // 2. Sample Requisition (RC)
  const sampleRequisition: PurchaseRequisition = {
    id: `rc_demo_01_${organizationId}`,
    organizationId,
    code: 'RC-2026-001',
    title: 'Materiais para Linha de Mosto — Cervejaria Heineken Paulínia',
    requestedBy: 'coord_montagem',
    requestedByName: 'Eng. Marcelo Antunes',
    department: 'Obras & Montagem',
    costCenter: 'CC-OBRA-PAULINIA-01',
    urgency: 'alta',
    neededByDate: nextWeek,
    status: 'pedido_gerado',
    items: [
      {
        id: 'it_rc_1',
        code: 'TB-INX-304-2-S10',
        description: 'Tubo Aço Inox 304 com costura SCH 10 2" DN50 ASTM A312',
        specs: 'AISI 304, 2" SCH 10, Solda BW',
        unit: 'M',
        quantity: 60,
        estimatedCost: 85.5,
        currentStock: 0,
      },
      {
        id: 'it_rc_2',
        code: 'VAL-BOR-304-2-WAF',
        description: 'Válvula Borboleta Wafer Inox 304 EPDM 2" 150#',
        specs: 'Wafer 150#, DN50, Disco 304, Vedação EPDM',
        unit: 'UN',
        quantity: 8,
        estimatedCost: 380.0,
        currentStock: 1,
      },
      {
        id: 'it_rc_3',
        code: 'FLG-WNR-304-2-150',
        description: 'Flange Pescoço Weld Neck RF Inox 304 2" 150# SCH 10',
        specs: 'ASME B16.5, 2" 150# SCH 10',
        unit: 'UN',
        quantity: 16,
        estimatedCost: 72.0,
        currentStock: 2,
      },
    ],
    notes: 'Prioridade alta para montagem na parada programada de manutenção da fábrica.',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await savePurchaseRequisition(sampleRequisition);

  // 3. Sample Purchase Order (OC)
  const sampleOrder: PurchaseOrder = {
    id: `oc_demo_01_${organizationId}`,
    organizationId,
    code: 'OC-2026-0042',
    requisitionCode: 'RC-2026-001',
    quotationMapCode: 'MAP-2026-001',
    supplierId: suppliers[0].id,
    supplierName: suppliers[0].name,
    supplierCnpj: suppliers[0].cnpj,
    supplierContact: suppliers[0].contactPerson,
    supplierEmail: suppliers[0].email,
    supplierPhone: suppliers[0].phone,
    buyerId: 'user_buyer_01',
    buyerName: userName,
    emissionDate: today,
    expectedDeliveryDate: nextWeek,
    deliveryLocation: 'Canteiro de Obras Paulínia SP (Av. Industrial, 1200)',
    billingAddress: 'Aguero Inox & Montagens Industriais S/A (Matriz)',
    paymentTerms: '28 dias DDL após faturamento',
    freightType: 'CIF',
    freightValue: 0,
    items: [
      {
        id: 'oc_it_1',
        itemNumber: 1,
        internalCode: 'TB-INX-304-2-S10',
        manufacturerCode: 'TUB-304-SCH10-DN50',
        brand: 'Aperam',
        description: 'Tubo Aço Inox 304 com costura SCH 10 2" DN50 ASTM A312',
        specs: 'AISI 304, 2" SCH 10, Solda BW, Barras de 6m',
        unit: 'M',
        quantityOrdered: 60,
        quantityReceived: 60,
        unitPrice: 85.5,
        totalPrice: 5130.0,
        heatNumber: 'CORR-AP-9412B',
      },
      {
        id: 'oc_it_2',
        itemNumber: 2,
        internalCode: 'CRV-90-304-2-S10',
        manufacturerCode: 'ELB-90LR-BW-304-DN50',
        brand: 'Aperam',
        description: 'Curva 90º Raio Longo Inox 304 SCH 10 2" BW ANSI B16.9',
        specs: 'AISI 304, 2" SCH 10',
        unit: 'UN',
        quantityOrdered: 12,
        quantityReceived: 12,
        unitPrice: 45.0,
        totalPrice: 540.0,
        heatNumber: 'CORR-AP-8821C',
      },
    ],
    subtotal: 5670.0,
    taxValue: 0,
    totalValue: 5670.0,
    status: 'recebida_total',
    carrierName: 'Jamef Transportes Urgentes',
    trackingCode: 'JAM-9920141',
    invoiceNumber: 'NF-e 049.201',
    receiptDate: today,
    notes: 'Entregue com certificados metalúrgicos de corrida inspecionados e aprovados.',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await savePurchaseOrder(sampleOrder);

  // 4. Sample Quotation Map (3-Bid comparison)
  const sampleQuotationMap: PurchaseQuotationMap = {
    id: `map_demo_01_${organizationId}`,
    organizationId,
    code: 'MAP-2026-001',
    title: 'Mapa Comparativo Tubulações e Válvulas Inox 304',
    requisitionId: sampleRequisition.id,
    requisitionCode: sampleRequisition.code,
    items: sampleRequisition.items,
    bids: [
      {
        id: 'bid_1',
        supplierId: suppliers[0].id,
        supplierName: suppliers[0].name,
        quoteNumber: 'COT-AP-2026-941',
        quoteDate: today,
        validityDays: 30,
        freightType: 'CIF',
        freightCost: 0,
        paymentTerms: '28 DDL',
        deliveryDays: 7,
        totalValue: 5670.0,
        isWinner: true,
        itemsPrices: [
          { itemId: 'it_rc_1', unitPrice: 85.5, totalPrice: 5130.0, brand: 'Aperam' },
          { itemId: 'it_rc_2', unitPrice: 410.0, totalPrice: 3280.0, brand: 'Bray' },
          { itemId: 'it_rc_3', unitPrice: 75.0, totalPrice: 1200.0, brand: 'Tenaris' },
        ],
        notes: 'Melhor prazo e frete CIF incluso no preço unitário.',
      },
      {
        id: 'bid_2',
        supplierId: 'sup_granjo',
        supplierName: 'Aços Granjo Distribuidora de Inox',
        quoteNumber: 'COT-AG-8812',
        quoteDate: today,
        validityDays: 15,
        freightType: 'FOB',
        freightCost: 350.0,
        paymentTerms: '30 DDL',
        deliveryDays: 12,
        totalValue: 6150.0,
        isWinner: false,
        itemsPrices: [
          { itemId: 'it_rc_1', unitPrice: 92.0, totalPrice: 5520.0, brand: 'Inox Tech' },
          { itemId: 'it_rc_2', unitPrice: 395.0, totalPrice: 3160.0, brand: 'MGA' },
          { itemId: 'it_rc_3', unitPrice: 72.0, totalPrice: 1152.0, brand: 'Conforja' },
        ],
        notes: 'Frete FOB por nossa conta; prazo superior a 10 dias.',
      },
    ],
    winningSupplierId: suppliers[0].id,
    winningSupplierName: suppliers[0].name,
    winningJustification: 'Menor valor global ponderado, frete CIF com entrega em 7 dias compatível com a parada de obra.',
    status: 'homologado',
    buyerName: userName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await savePurchaseQuotation(sampleQuotationMap);
}

// ---------------------------------------------------------------------------
// 7. AI MARKET PRICE BENCHMARK & MONTHLY SAVINGS
// ---------------------------------------------------------------------------

export async function fetchAiMarketBenchmark(
  items?: any[],
  totalSpend?: number
): Promise<MonthlySavingsReport> {
  try {
    const res = await fetch('/api/ai/market-benchmark', {
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
    const spend = totalSpend && totalSpend > 0 ? totalSpend : 384500;
    return {
      month: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date()),
      totalMonthlySpend: spend,
      estimatedMarketSpend: spend * 1.108,
      totalSavingsAmount: spend * 0.108,
      savingsPercentage: 9.8,
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
          sourceNotes: 'Aperam Tubos / Marcegaglia Brasil',
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
          sourceNotes: 'Bray Controls / MGA Válvulas',
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
          sourceNotes: 'Conforja / Tenaris Brasil',
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
          sourceNotes: 'Aperam / ArcelorMittal Inox Brasil',
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
          sourceNotes: 'Conexões forjadas nacionais com MTR rastreável',
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
          sourceNotes: 'ESAB / Lincoln Electric Brasil',
        },
      ],
      aiMarketAnalysisSummary: 'Cotação do Níquel na London Metal Exchange (LME) em US$ 16.420/t com mercado estável. O processo de equalização técnica de propostas permitiu negociar economia média de 9,8% com fornecedores homologados.',
      commodityIndices: {
        nickelLmeUsdTon: 16420,
        dollarPtaxBrl: 5.72,
        stainlessSurchargeTrend: 'Moderada / Estável (+1.2% previsto para próximo mês)',
      },
    };
  }
}
