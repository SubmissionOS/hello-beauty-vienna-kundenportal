import type {
  Appointment,
  Category,
  CategoryId,
  CustomerExport,
  CustomerProfile,
  NewAppointment,
  NewCustomer,
  ProfilePatch,
  Service,
  Slot,
  StaffMember,
} from './types';

/**
 * Einzige Schnittstelle zwischen Oberfläche und Daten.
 * Teil 1: MockDataAdapter (localStorage). Teil 2: SupabaseDataAdapter mit derselben Signatur –
 * die Oberfläche ändert sich dabei nicht. Alle Methoden sind asynchron und werfen bei Fehlern `DataError`.
 * Zugriffsschutz (nur eigene Daten) liegt in Teil 2 bei Row Level Security, nicht in der Oberfläche.
 */
export interface DataAdapter {
  // Katalog (öffentlich)
  listCategories(): Promise<Category[]>;
  listServices(categoryId?: CategoryId): Promise<Service[]>;
  getService(serviceId: string): Promise<Service | null>;
  listStaff(categoryId?: CategoryId): Promise<StaffMember[]>;
  /** Freie Startzeiten an einem Tag ('YYYY-MM-DD'); staffId null = beliebige Mitarbeiterin */
  listAvailableSlots(query: { serviceId: string; staffId: string | null; date: string }): Promise<Slot[]>;

  // Kundin (nur eigene Daten)
  createCustomer(input: NewCustomer): Promise<CustomerProfile>;
  findCustomerIdByEmail(email: string): Promise<string | null>;
  getProfile(customerId: string): Promise<CustomerProfile | null>;
  updateProfile(customerId: string, patch: ProfilePatch): Promise<CustomerProfile>;
  listAppointments(customerId: string): Promise<Appointment[]>;
  createAppointment(input: NewAppointment): Promise<Appointment>;
  exportCustomerData(customerId: string): Promise<CustomerExport>;
  deleteCustomer(customerId: string): Promise<void>;
}
