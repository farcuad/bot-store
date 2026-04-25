export interface BankAccount {
  id?: string;
  country: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  accountType: string;
  isActive: boolean;
  createdAt?: number;
  updatedAt?: number;
}
