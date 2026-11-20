export type OnboardingStatus =
  | 'pending' // link ativo aguardando preenchimento pelo colaborador
  | 'submitted' // preenchido pelo colaborador, aguardando conferência do RH
  | 'approved' // aprovado pelo RH e convertido em funcionário ativo
  | 'rejected' // devolvido com apontamento / pendência
  | 'expired'; // expirado por decurso de prazo

export interface OnboardingDocumentAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  uploadedAt: string;
  sizeBytes?: number;
}

export interface OnboardingSubmittedData {
  // 1. Dados Pessoais & Filiação
  fullName: string;
  birthDate: string;
  gender: string;
  maritalStatus: string;
  motherName: string;
  fatherName?: string;
  nationality: string;
  birthCity: string;
  birthState: string;

  // 2. Documentos Físicos e Digitais
  cpf: string;
  rgNumber: string;
  rgIssuer: string;
  rgIssueDate: string;
  pisPasep: string;
  ctpsNumber: string;
  ctpsSeries: string;
  ctpsUf: string;
  voterTitle?: string;
  cnhNumber?: string;
  cnhCategory?: string;

  // 3. Endereço e Contato
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;

  // 4. Informações Profissionais e Bancárias
  role: string;
  department: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankAccountType?: 'corrente' | 'poupanca' | 'salario';
  pixKey?: string;
  dependentsCount: number;

  // 5. Documentos Obrigatórios Anexados (Upload)
  documents: {
    rgFront?: OnboardingDocumentAttachment;
    rgBack?: OnboardingDocumentAttachment;
    cpfDoc?: OnboardingDocumentAttachment;
    ctpsDoc?: OnboardingDocumentAttachment;
    pisDoc?: OnboardingDocumentAttachment;
    proofOfResidence?: OnboardingDocumentAttachment;
    asoDoc?: OnboardingDocumentAttachment;
    otherDoc?: OnboardingDocumentAttachment;
  };

  // 6. Aceite e Consentimento LGPD
  acceptedLgpd: boolean;
  acceptedAt: string;
  clientIp?: string;
}

export interface EmployeeOnboarding {
  id: string;
  token: string;
  organizationId: string;
  createdBy: string;
  createdByName: string;
  status: OnboardingStatus;
  targetRole: string;
  targetDepartment: string;
  targetUnitId?: string;
  targetContractId?: string;
  proposedSalary?: number;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  submittedData?: OnboardingSubmittedData;
  resultingEmployeeId?: string;
}
