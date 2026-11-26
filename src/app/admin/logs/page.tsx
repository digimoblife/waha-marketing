import { redirect } from 'next/navigation';
export default function LegacyAdminLogsRedirect() {
  redirect('/logs');
}
