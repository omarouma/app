import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Terms of Service</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6">
          <div className="w-12 h-12 rounded-full bg-[#00C300]/10 flex items-center justify-center mb-4">
            <FileText size={24} className="text-[#00C300]" />
          </div>
          <h2 className="text-[#111111] font-semibold mb-2">Acceptance of Terms</h2>
          <p className="text-[#8D8D8D] text-sm leading-relaxed">
            By using GaGa Chat, you agree to these Terms of Service and our Privacy Policy. These terms are governed by the applicable laws of your jurisdiction. If you do not agree, please do not use our services.
          </p>
          <p className="text-[#8D8D8D] text-xs mt-2">Last updated: January 2026</p>
        </div>

        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 space-y-4">
          {[
            { title: '1. Eligibility', text: 'You must be at least 13 years old. Users 13-17 need parental consent. Wallet features require age 18+. By using GaGa Chat, you confirm you meet these requirements.' },
            { title: '2. User Conduct', text: 'You may not use GaGa Chat for illegal purposes under applicable local law. Prohibited content includes harassment, spam, malware, IP infringement, terrorism promotion, and financial fraud.' },
            { title: '3. Account Security', text: 'You are responsible for your credentials. Notify us immediately of unauthorized access. We recommend enabling 2FA and wallet PIN for added security.' },
            { title: '4. Intellectual Property', text: 'GaGa Chat and its content are protected by applicable copyright and trademark laws. "GaGa Chat" and the GaGa logo are registered trademarks. No reproduction without permission.' },
            { title: '5. Wallet & Gaga Coins', text: 'Gaga Coins are virtual credits with no cash value outside the app. They are non-refundable and non-transferable. local currency conversions follow applicable financial regulations. Fraud will result in suspension and legal action.' },
            { title: '6. Content Moderation', text: 'We actively moderate content to comply with applicable law. We cooperate with relevant authorities on valid legal requests. You grant us a license to process your content for service operation.' },
            { title: '7. Termination', text: 'We may terminate your account for violations, with or without notice. You may delete your account anytime via settings. Upon termination, your service access ends immediately.' },
            { title: '8. Limitation of Liability', text: 'GaGa Chat is provided "as is". To the maximum extent under applicable law, we are not liable for indirect damages. Total liability is capped at ৳1,000 or fees paid in the last 12 months.' },
            { title: '9. Dispute Resolution', text: 'Disputes shall first be resolved amicably. If unresolved, arbitration under applicable arbitration laws in the jurisdiction of the user applies. Both parties submit to the courts of their respective jurisdiction.' },
            { title: '10. Contact', text: 'Email: legal@gagachat.app | Address: GaGa Chat Global HQ | Support: 24/7 in-app chat' },
          ].map((section) => (
            <div key={section.title} className="pb-4 border-b border-[#EBEBEB] last:border-0 last:pb-0">
              <h3 className="text-[#111111] font-medium text-sm mb-1">{section.title}</h3>
              <p className="text-[#8D8D8D] text-sm leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
