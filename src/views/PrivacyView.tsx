import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function PrivacyView() {
  return (
    <div className="bg-white min-h-[100dvh]">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-[#111111] mb-2">Privacy Policy</h1>
          <p className="text-[#8D8D8D] text-sm mb-8">Last updated: January 2026 | Effective globally</p>
          
          <div className="space-y-8 text-[#8D8D8D] text-sm leading-relaxed">
            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">1. Information We Collect</h2>
              <p className="mb-2">
                GaGa Chat collects information you provide directly when you register, including your name, email address, phone number, profile photo, and the messages you send. We also collect:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Device Information:</strong> Device type, operating system, and unique device identifiers for security and analytics.</li>
                <li><strong>Usage Data:</strong> How you interact with the app (features used, time spent) to improve our services.</li>
                <li><strong>Location Data:</strong> With your permission, we may collect approximate location for regional content and security.</li>
                <li><strong>Wallet Data:</strong> Gaga Coin balances and fiat currency transaction records for your in-app wallet.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">2. How We Use Your Information</h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Provide, maintain, and improve GaGa Chat services</li>
                <li>Process Gaga Coin transactions and fiat currency conversions</li>
                <li>Ensure platform security and prevent fraud or abuse</li>
                <li>Communicate with you about updates, security alerts, and support</li>
                <li>Comply with applicable legal requirements including data protection regulations in your jurisdiction</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">3. End-to-End Encryption</h2>
              <p>
                Your messages are protected with end-to-end encryption (E2EE). This means only you and the recipient can read your messages. Neither GaGa Chat nor any third party can access the content of your encrypted messages. We use industry-standard encryption protocols (TLS 1.3 for transit, AES-256 for stored data) to protect your communications.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">4. Data Storage & Location</h2>
              <p>
                GaGa Chat stores your data on Firebase servers located in the Asia region (Singapore). We are committed to ensuring your data is stored securely and in compliance with applicable data protection requirements. While we aim to store data within the Asia region, backup and disaster recovery systems may use additional secure locations.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">5. Data Sharing & Third Parties</h2>
              <p className="mb-2">
                We do <strong>not</strong> sell your personal data to third parties. We may share data with:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Service Providers:</strong> Cloud infrastructure (Google Firebase), payment processors (for wallet features), and analytics providers, all under strict confidentiality agreements.</li>
                <li><strong>Legal Compliance:</strong> When required by applicable law, court order, or to protect our users and platform from harm.</li>
                <li><strong>Content Moderation:</strong> To comply with the Digital Security Act 2018 and prevent illegal content distribution.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">6. Digital Security Act 2018 Compliance</h2>
              <p>
                GaGa Chat complies with the applicable data protection and digital security laws. We actively monitor and remove content that promotes terrorism, extremism, or illegal activities. We cooperate with relevant law enforcement agencies when presented with valid legal requests. Users are prohibited from using the platform to distribute content that violates applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">7. Your Rights</h2>
              <p className="mb-2">You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Access:</strong> Request a copy of all personal data we hold about you</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                <li><strong>Deletion:</strong> Delete your account and all associated data permanently</li>
                <li><strong>Export:</strong> Download your data in JSON format</li>
                <li><strong>Restriction:</strong> Limit how we process your data</li>
                <li><strong>Objection:</strong> Object to certain types of data processing</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, contact us at <strong>privacy@gagachat.app</strong> or use the in-app "Export Data" and "Delete Account" features.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">8. Wallet & Financial Data</h2>
              <p>
                Gaga Coins and fiat currency balances are stored securely in our Firebase database. We do not store bank account details or payment card information on our servers. All financial transactions are logged for compliance with applicable financial regulations and anti-money laundering (AML) requirements. Users must be 18+ to use wallet features.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">9. Cookies & Tracking</h2>
              <p>
                We use cookies and similar technologies to keep you logged in, remember your preferences, and analyze app usage. You can disable cookies through your browser settings, but this may affect app functionality. We do not use third-party tracking cookies for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">10. Children's Privacy</h2>
              <p>
                GaGa Chat is not intended for children under 13. We do not knowingly collect data from children under 13. If we discover that a child under 13 has provided personal data, we will delete it immediately. For users aged 13-17, parental consent is required for wallet features.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email. Continued use of GaGa Chat after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-[#111111] font-semibold text-base mb-3">12. Contact Us</h2>
              <p className="mb-2">
                If you have questions about this Privacy Policy or your data rights, please contact us:
              </p>
              <div className="bg-[#F5F5F5] rounded-xl p-4 text-[#111111]">
                <p><strong>Email:</strong> privacy@gagachat.app</p>
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
