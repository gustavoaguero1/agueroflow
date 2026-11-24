export interface WorkOrderLinkSource {
  id?: string;
  orderNumber?: string;
  title?: string;
}

export interface WorkOrderLinkFields {
  linkedWorkOrderId?: string;
  linkedWorkOrderNumber?: string;
  linkedWorkOrderTitle?: string;
}

/** Copies a validated OS reference into purchasing records without creating empty links. */
export function workOrderLinkFields(source?: WorkOrderLinkSource | null): WorkOrderLinkFields {
  if (!source?.id) return {};
  return {
    linkedWorkOrderId: source.id,
    linkedWorkOrderNumber: source.orderNumber || undefined,
    linkedWorkOrderTitle: source.title || undefined,
  };
}
