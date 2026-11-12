import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RegisterForm from './RegisterForm';

export default async function RegisterPage() {
  const session = await auth();
  if (session) redirect('/');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏈</div>
          <h1 className="text-3xl font-bold gradient-text">NFL Picks</h1>
          <p className="text-muted-foreground mt-2">Create your account</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
