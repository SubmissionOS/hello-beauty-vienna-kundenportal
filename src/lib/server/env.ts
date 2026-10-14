import 'server-only';

/**
 * Private Umgebungswerte – nur serverseitig lesbar. `import 'server-only'` lässt den Build scheitern,
 * sobald eine Client-Komponente diese Datei (direkt oder indirekt) importiert.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return v;
}

export const serverEnv = {
  supabaseSecretKey: () => required('SUPABASE_SECRET_KEY'),
  demoCustomerPassword: () => required('DEMO_CUSTOMER_PASSWORD'),
};
