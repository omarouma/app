import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function CommunityGuidelinesPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Community Guidelines</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6">
          <div className="w-12 h-12 rounded-full bg-[#00C300]/10 flex items-center justify-center mb-4">
            <Shield size={24} className="text-[#00C300]" />
          </div>
          <h2 className="text-[#111111] font-semibold mb-2">Welcome to GaGa Chat</h2>
          <p className="text-[#8D8D8D] text-sm leading-relaxed">
            Our community guidelines exist to keep GaGa Chat a safe, respectful, and welcoming place for everyone. By using our platform, you agree to follow these guidelines. Violations may result in content removal, account suspension, or permanent bans.
          </p>
          <p className="text-[#8D8D8D] text-xs mt-2">Last updated: January 2026</p>
        </div>

        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 space-y-4">
          {[
            { title: '1. Be Respectful', text: 'Treat everyone with respect. Do not harass, bully, or threaten others. Avoid hate speech, discrimination, or content that targets individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics.' },
            { title: '2. No Harmful Content', text: 'Do not share content that promotes violence, self-harm, or dangerous activities. Do not post graphic violence, gore, or disturbing content without appropriate warnings. Do not share content that could endanger children or vulnerable individuals.' },
            { title: '3. Privacy Matters', text: 'Respect the privacy of others. Do not share personal information (doxing) without consent. Do not share private messages, photos, or videos of others without their permission. Report any content that violates privacy.' },
            { title: '4. Authentic Content', text: 'Do not spread misinformation, fake news, or deceptive content. Do not impersonate others or create fake accounts. Do not manipulate engagement through bots, fake accounts, or coordinated inauthentic behavior.' },
            { title: '5. Intellectual Property', text: 'Only share content you have the right to share. Respect copyright, trademarks, and other intellectual property rights. Do not share pirated content or unauthorized copies of copyrighted material.' },
            { title: '6. Financial Safety', text: 'Do not use GaGa Chat for scams, fraud, or financial schemes. Do not share fake investment opportunities or pyramid schemes. Be cautious when sending money through the platform. Report suspicious financial behavior.' },
            { title: '7. Marketplace Safety', text: 'Be honest in marketplace listings. Do not sell prohibited items (weapons, drugs, counterfeit goods, etc.). Meet in safe public places for local transactions. Report fraudulent listings immediately.' },
            { title: '8. Reporting Violations', text: 'If you see content that violates these guidelines, please report it using the built-in reporting tools. Our moderation team reviews reports and takes appropriate action. False reports may result in account penalties.' },
            { title: '9. Enforcement', text: 'Violations are handled on a case-by-case basis. Minor violations may result in warnings or content removal. Serious or repeated violations may result in temporary or permanent account suspension. We cooperate with law enforcement on serious legal matters.' },
            { title: '10. Appeals', text: 'If you believe your content was removed or your account was suspended in error, you may appeal by contacting support@gagachat.app with details about your case. We review all appeals within 7 business days.' },
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
