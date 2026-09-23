import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';

export default function CookiePolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100vh] bg-muted">
      <div className="bg-background border-b border-border flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-muted rounded-full text-foreground">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Cookie Policy</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-background border border-border rounded-2xl p-6">
          <div className="w-12 h-12 rounded-full bg-[#FF9800]/10 flex items-center justify-center mb-4">
            <Cookie size={24} className="text-[#FF9800]" />
          </div>
          <h2 className="text-foreground font-semibold mb-2">About Cookies</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            GaGa uses cookies and similar technologies to provide, protect, and improve our services. This policy explains what cookies are, how we use them, and your choices regarding their use.
          </p>
          <p className="text-muted-foreground text-xs mt-2">Last updated: January 2026</p>
        </div>

        <div className="bg-background border border-border rounded-2xl p-4 space-y-4">
          {[
            { title: '1. What Are Cookies', text: 'Cookies are small text files stored on your device when you visit a website. They help us recognize your device, remember your preferences, and understand how you use our services.' },
            { title: '2. Types of Cookies We Use', text: 'Essential cookies: Required for the app to function (authentication, security). Performance cookies: Help us understand usage patterns and improve performance. Preference cookies: Remember your settings like language and theme. Analytics cookies: Help us understand how users interact with GaGa.' },
            { title: '3. How We Use Cookies', text: 'Authentication: To keep you signed in. Security: To detect suspicious activity. Preferences: To remember your settings. Analytics: To improve our services. Features: To enable features like dark mode and language selection.' },
            { title: '4. Third-Party Cookies', text: 'We may use third-party services like Firebase Analytics and Google Analytics that set their own cookies. These help us understand app usage and improve our services. We do not share personal data with advertisers.' },
            { title: '5. Managing Cookies', text: 'You can control cookies through your browser settings. Note that disabling essential cookies may prevent GaGa from working properly. Most browsers allow you to block or delete cookies in their settings menu.' },
            { title: '6. PWA & Local Storage', text: 'As a Progressive Web App, GaGa also uses localStorage and IndexedDB to store app data, messages, and settings for offline functionality. This data remains on your device and is not shared with third parties.' },
            { title: '7. Changes to This Policy', text: 'We may update this Cookie Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.' },
            { title: '8. Contact Us', text: 'If you have questions about this Cookie Policy, contact us at privacy@gagachat.app' },
          ].map((section) => (
            <div key={section.title} className="pb-4 border-b border-border last:border-0 last:pb-0">
              <h3 className="text-foreground font-medium text-sm mb-1">{section.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
