import { Link } from 'react-router-dom';
import { MessageCircle, Globe, Shield, Zap } from 'lucide-react';
import Logo from '@/components/Logo';

const footerLinks = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Security', href: '/#security' },
      { label: 'Reels', to: '/reels' },
      { label: 'Live Streams', to: '/live-streams' },
      { label: 'Voice Rooms', to: '/voice-rooms' },
      { label: 'Events', to: '/events' },
      { label: 'Marketplace', to: '/marketplace' },
      { label: 'Creator Center', to: '/creators' },
      { label: 'Download', to: '/auth' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Careers', href: '#' },
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
    <footer className="bg-white border-t border-[#EBEBEB] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4" aria-label="GaGa Chat Home">
              <Logo size={32} />
            </Link>
            <p className="text-[#8D8D8D] text-sm max-w-xs leading-relaxed mb-4">
              GaGa Chat - The future of messaging. Free global messaging, HD voice &amp; video calls, reels, live streaming, marketplace, and creator tools. Secure, fast, and beautiful. Free for everyone in Bangladesh and worldwide.
            </p>
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#EBEBEB] flex items-center justify-center" title="Messaging">
                  <MessageCircle size={14} className="text-[#8D8D8D]" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-white border border-[#EBEBEB] flex items-center justify-center" title="Global">
                  <Globe size={14} className="text-[#8D8D8D]" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-white border border-[#EBEBEB] flex items-center justify-center" title="Secure">
                  <Shield size={14} className="text-[#8D8D8D]" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-white border border-[#EBEBEB] flex items-center justify-center" title="Fast">
                  <Zap size={14} className="text-[#8D8D8D]" />
                </div>
            </div>
          </div>
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-[#111111] font-semibold text-sm mb-4">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className="text-[#8D8D8D] hover:text-[#00C300] text-sm transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href || '#'} className="text-[#8D8D8D] hover:text-[#00C300] text-sm transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[#EBEBEB] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#8D8D8D] text-xs">
            &copy; {currentYear} GaGa Chat. All rights reserved. GaGa Chat is a free messaging app available in Bangladesh &amp; globally.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[#8D8D8D] text-xs">Made with care for Bangladesh &amp; the world</span>
          </div>
          </div>
        </div>
    </footer>
  );
}
