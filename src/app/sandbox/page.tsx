import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SandboxEntry from './SandboxEntry';

export default async function SandboxPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');
  return <SandboxEntry />;
}
