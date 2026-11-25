export function calculateThirteenthAvos(admissionDateStr: string, referenceYear = new Date().getFullYear(), dismissalDateStr?: string | null): number {
  if (typeof admissionDateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(admissionDateStr)) return 0;
  const admissionDate = new Date(admissionDateStr + 'T00:00:00');
  if (Number.isNaN(admissionDate.getTime()) || admissionDate.toISOString().slice(0, 10) !== admissionDateStr) return 0;
  const admYear = admissionDate.getFullYear(), admMonth = admissionDate.getMonth(), admDay = admissionDate.getDate();
  if (admYear > referenceYear) return 0;
  let cutOffMonth = 11, cutOffDay = 31;
  if (dismissalDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dismissalDateStr)) return 0;
    const disDate = new Date(dismissalDateStr + 'T00:00:00');
    if (Number.isNaN(disDate.getTime()) || disDate.toISOString().slice(0, 10) !== dismissalDateStr) return 0;
    if (disDate.getFullYear() === referenceYear) { cutOffMonth = disDate.getMonth(); cutOffDay = disDate.getDate(); }
    else if (disDate.getFullYear() < referenceYear) return 0;
  }
  if (admYear < referenceYear) {
    let avos = cutOffMonth + 1;
    if (dismissalDateStr && cutOffDay < 15) avos -= 1;
    return Math.max(0, Math.min(12, avos));
  }
  let avos = 0;
  for (let month = admMonth; month <= cutOffMonth; month++) {
    if (month === admMonth && month === cutOffMonth && dismissalDateStr) {
      if (cutOffDay - admDay + 1 >= 15) avos += 1;
    } else if (month === admMonth) {
      if (new Date(referenceYear, month + 1, 0).getDate() - admDay + 1 >= 15) avos += 1;
    } else if (month === cutOffMonth && dismissalDateStr) {
      if (cutOffDay >= 15) avos += 1;
    } else avos += 1;
  }
  return Math.max(0, Math.min(12, avos));
}
