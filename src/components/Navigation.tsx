'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Calendar, Radio, MessageCircle, MoreHorizontal } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

interface NavProps { leagueName: string; user: { id: string; email: string; name?: string | null; role: string; avatarUrl?: string | null } }
export default function Navigation({ user, leagueName }: NavProps) {
  const path = usePathname();
  const secondary = [['/pick-status','Pick Check'],['/calendar','Calendar'],['/games','Games'],['/news','News'],['/history','History'],['/records','Records'],[`/profile/${user.id}`,'Profile & settings'], ...(user.role === 'ADMIN' ? [['/admin','Commissioner'],['/sandbox','Sandbox']] : [])];
  const active = (href: string) => href === '/' ? path === href : path.startsWith(href);
  return <nav aria-label="Main navigation" className="app-navigation sticky top-0 z-50 border-b border-border bg-card/95 text-card-foreground shadow-sm backdrop-blur-md">
    <div className="mx-auto flex h-[64px] max-w-7xl items-center justify-between gap-0 px-1 sm:gap-3 sm:px-4">
      <Link href="/" className="hidden min-w-0 items-center gap-2 sm:flex" aria-label={leagueName}><span className="text-2xl" aria-hidden="true">🏈</span><span className="hidden max-w-40 truncate font-bold lg:block">{leagueName}</span></Link>
      <div className="flex items-center gap-0 sm:gap-2">
        {[{href:'/',label:'Leaderboard',Icon:Trophy},{href:'/picks',label:'Picks',Icon:Calendar},{href:'/game-day',label:'Game Day',Icon:Radio}].map(({href,label,Icon}) => <Button key={href} asChild variant="ghost" className={`h-[44px] w-[44px] px-0 sm:w-auto sm:px-3 ${active(href) ? 'bg-primary/15 text-primary' : ''}`}><Link href={href} aria-label={label} aria-current={active(href) ? 'page' : undefined} title={label}><Icon className="h-5 w-5 shrink-0"/><span className="ml-2 hidden xl:inline">{label}</span></Link></Button>)}
        <Button variant="ghost" className="h-[44px] w-[44px] px-0 sm:w-auto sm:px-3" aria-label="Open league chat" title="Chat" onClick={()=>window.dispatchEvent(new Event('nfl:chat-open'))}><MessageCircle className="h-5 w-5"/><span className="ml-2 hidden xl:inline">Chat</span></Button>
        <Menu.Root><Menu.Trigger asChild><Button variant="ghost" aria-label="More navigation" title="More" className={`h-[44px] w-[44px] px-0 sm:w-auto sm:px-3 ${secondary.some(([href])=>active(href)) ? 'text-primary bg-primary/15' : ''}`}><MoreHorizontal className="h-5 w-5"/><span className="ml-2 hidden xl:inline">More</span></Button></Menu.Trigger>
          <Menu.Portal><Menu.Content align="end" sideOffset={8} className="z-[80] max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl">
            {secondary.map(([href,label])=><Menu.Item key={href} asChild><Link href={href} aria-current={active(href)?'page':undefined} className="flex min-h-11 items-center rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">{label}</Link></Menu.Item>)}
            <Menu.Separator className="my-1 h-px bg-border"/>
            <Menu.Item onSelect={()=>void signOut({callbackUrl:'/login'})} className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-accent">Sign out</Menu.Item>
          </Menu.Content></Menu.Portal>
        </Menu.Root>
      </div>
      <div className="flex shrink-0 items-center gap-0"><NotificationBell/><Link href={`/profile/${user.id}`} aria-label="Your profile and settings" className="flex h-[44px] w-[44px] items-center justify-center"><Avatar className="h-[32px] w-[32px]"><AvatarImage src={user.avatarUrl ?? undefined} alt=""/><AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{(user.name||user.email).slice(0,2).toUpperCase()}</AvatarFallback></Avatar></Link></div>
    </div>
  </nav>;
}
