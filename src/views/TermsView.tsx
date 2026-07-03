import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function TermsView() {
  return (
    <div className="bg-white min-h-[100dvh]">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-[#111111] mb-2">Terms of Service</h1>
          <p className="text-[#8D8D8D] text-sm mb-8">Last updated: January 2026 | Governing Law: Applicable in your jurisdiction</p>
          
          <div className="space-y-8 text-[#8D8D8D] text-sm leading-relaxed">
            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using GaGa Chat, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, please do not use our services. These terms are governed by the applicable laws of your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">2. Eligibility</h2>
              <p>
                You must be at least 13 years old to use GaGa Chat. Users aged 13-17 must have parental consent. To use wallet features (Gaga Coins and BDT), you must be 18 years or older. By using our services, you represent that you meet these requirements and that the information you provide is accurate.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">3. User Conduct</h2>
              <p className="mb-2">You agree not to use GaGa Chat for any unlawful purpose or to transmit content that is:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Illegal under applicable local law</li>
                <li>Harmful, threatening, abusive, harassing, or defamatory</li>
                <li>Spam, malware, or designed to disrupt the service</li>
                <li>Infringing on intellectual property rights</li>
                <li>Promoting terrorism, extremism, or violence</li>
                <li>Involved in fraud, money laundering, or illegal financial schemes</li>
              </ul>
              <p className="mt-2">
                Violation may result in immediate account termination and reporting to relevant authorities.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">4. Account Security</h2>
              <p>
                You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized access. GaGa Chat offers two-factor authentication (2FA) and PIN protection for wallets. We strongly recommend enabling these features.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">5. Intellectual Property</h2>
              <p>
                GaGa Chat and its content (logos, trademarks, software, design) are protected by copyright, trademark, and other applicable intellectual property laws. You may not reproduce, distribute, modify, or create derivative works without our express written permission. "GaGa Chat" and the GaGa logo are registered trademarks.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">6. Wallet & Gaga Coins</h2>
              <p className="mb-2">
                Gaga Coins are virtual credits for use within the GaGa Chat ecosystem. They have no cash value outside the app. Key terms:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Gaga Coins are non-refundable and non-transferable except as explicitly permitted</li>
                <li>Local currency conversions are processed according to applicable financial regulations</li>
                <li>We reserve the right to modify conversion rates and reward structures</li>
                <li>Fraudulent acquisition of coins will result in account suspension and legal action</li>
                <li>Users are responsible for all tax obligations related to coin earnings</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">7. Content Moderation</h2>
              <p>
                We actively moderate content to comply with applicable law. We use automated systems and human review to detect and remove prohibited content. We cooperate with relevant law enforcement and regulatory bodies when presented with valid legal requests. You grant us a license to process your content for the purpose of operating the service.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">8. Termination</h2>
              <p>
                We may terminate or suspend your account at any time for violations of these terms, with or without notice. You may also delete your account at any time through the app settings. Upon termination, your right to use the service ceases immediately, but provisions regarding intellectual property, liability, and dispute resolution survive.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">9. Limitation of Liability</h2>
              <p>
                GaGa Chat is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by applicable law, we are not liable for any indirect, incidental, special, or consequential damages arising from your use of the service. Our total liability shall not exceed the amount you have paid us in the preceding 12 months, or ৳1,000 if no payment was made.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">10. Dispute Resolution</h2>
              <p>
                Any dispute arising from these Terms shall first be attempted to be resolved through amicable negotiation. If unresolved, disputes shall be subject to arbitration under applicable arbitration laws, conducted in the language of the jurisdiction. Both parties agree to submit to the exclusive jurisdiction of the courts in the applicable jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">11. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. We will notify you of significant changes through the app or via email at least 7 days before they take effect. Continued use of GaGa Chat after changes constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">12. Contact</h2>
              <div className="bg-[#F5F5F5] rounded-xl p-4 text-[#111111]">
                <p><strong>Email:</strong> legal@gagachat.app</p>
                <p><strong>Address:</strong> GaGa Chat Global HQ</p>
                <p><strong>Support:</strong> Available 24/7 via in-app chat</p>
              </div>
            </section>
          </div>

          <div className="mt-8">
            <Link to="/" className="text-[#00C300] text-sm hover:underline">Back to Home</Link>
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
