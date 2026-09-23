import { Link } from 'react-router-dom';
import { MessageCircle, Globe, Shield, Zap } from 'lucide-react';
import Logo from '@/components/Logo';

const footerLinks = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Security', href: '/#security' },
      { label: 'Messaging', to: '/auth' },
      { label: 'Voice & Video Calls', to: '/auth' },
      { label: 'Group Chats', to: '/auth' },
      { label: 'Download', to: '/auth' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Blog', to: '/blog' },
      { label: 'Careers', to: '/careers' },
      { label: 'Admin', to: '/admin' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'Community Guidelines', to: '/community-guidelines' },
      { label: 'Cookie Policy', to: '/cookies' },
      { label: 'Report a Problem', href: '/#security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Cookie Policy', to: '/cookies' },
    ],
  },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-background border-t border-border py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4" aria-label="GaGa Home">
              <Logo size={32} />
            </Link>
            <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-4">
              GaGa - The future of messaging. Free global messaging, HD voice & video calls, and group chats. Secure, fast, and beautiful. Free for everyone in Bangladesh and worldwide.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center" title="Messaging">
                <MessageCircle size={14} className="text-muted-foreground" />
              </div>
              <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center" title="Global">
                <Globe size={14} className="text-muted-foreground" />
              </div>
              <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center" title="Secure">
                <Shield size={14} className="text-muted-foreground" />
              </div>
              <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center" title="Fast">
                <Zap size={14} className="text-muted-foreground" />
              </div>
            </div>
          </div>
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-foreground font-semibold text-sm mb-4">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className="text-muted-foreground hover:text-[#00C300] text-sm transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href || '#'} className="text-muted-foreground hover:text-[#00C300] text-sm transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            &copy; {currentYear} GaGa. All rights reserved. GaGa is a free messaging app available in Bangladesh &amp; globally.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-xs">Made with care for Bangladesh &amp; the world</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
