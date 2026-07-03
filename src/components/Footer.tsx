import { Link } from 'react-router-dom';
import { MessageCircle, Globe, Shield, Zap } from 'lucide-react';
import Logo from '@/components/Logo';

const footerLinks = [
  { title: 'Product', links: [
    { label: 'Features', href: '/#features' },
    { label: 'Security', href: '/#security' },
    { label: 'Creators', href: '/creators' },
    { label: 'Download', href: '/auth' },
  ]},
  { title: 'Company', links: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
  ]},
  { title: 'Legal', links: [
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Terms of Service', to: '/terms' },
  ]},
];

export default function Footer() {
  return (
    <footer className="bg-[#F5F5F5] border-t border-[#EBEBEB] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <Logo size={32} />
            </Link>
            <p className="text-[#8D8D8D] text-sm max-w-xs leading-relaxed mb-4">
              The future of messaging. Secure, fast, and beautiful. Free for everyone, everywhere.
            </p>
            <div className="flex items-center gap-3">
              {[
                { icon: MessageCircle, label: 'Chat' },
                { icon: Globe, label: 'Global' },
                { icon: Shield, label: 'Secure' },
                { icon: Zap, label: 'Fast' },
              ].map((item) => (
                <div key={item.label} className="w-8 h-8 rounded-lg bg-white border border-[#EBEBEB] flex items-center justify-center" title={item.label}>
                  <item.icon size={14} className="text-[#8D8D8D]" />
                </div>
              ))}
            </div>
          </div>
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-[#111111] font-semibold text-sm mb-4">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {'to' in link ? (
                      <Link to={link.to} className="text-[#8D8D8D] hover:text-[#00C300] text-sm transition-colors">{link.label}</Link>
                    ) : (
                      <span className="text-[#8D8D8D] hover:text-[#00C300] text-sm transition-colors cursor-pointer">{link.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[#EBEBEB] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#C7C7CC] text-xs"> 2026 GaGa Chat. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="text-[#C7C7CC] text-xs">Made with care for the world</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
