import { ArrowLeft, BadgeCheck, Globe, Shield, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AboutPage() {
    const navigate = useNavigate();

    const pillars = [
        {
            icon: Globe,
            title: 'Global by design',
            text: 'GaGa Chat is built for fast, affordable communication across borders, helping people stay close without friction.',
        },
        {
            icon: Shield,
            title: 'Secure by default',
            text: 'From protected accounts to privacy-first settings, we make safety a core part of the experience instead of an afterthought.',
        },
        {
            icon: Sparkles,
            title: 'Creative at heart',
            text: 'We combine messaging, creator tools, live events, and community features so people can connect, create, and earn in one place.',
        },
    ];

    return (
        <div className="min-h-[100dvh] bg-[#F5F5F5]">
            <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
                <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full text-[#111111] hover:bg-[#F5F5F5]">
                    <ArrowLeft size={22} />
                </button>
                <h1 className="text-lg font-bold text-[#111111]">About GaGa Chat</h1>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <section className="bg-white border border-[#EBEBEB] rounded-3xl p-6 md:p-8">
                    <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-4">
                        <BadgeCheck size={14} className="text-[#00C300]" />
                        <span className="text-[#00C300] text-sm font-medium">Built for people, not platforms</span>
                    </div>
                    <h2 className="text-3xl font-bold text-[#111111] mb-3">The social app designed for everyday connection.</h2>
                    <p className="text-[#8D8D8D] leading-relaxed">
                        GaGa Chat brings together messaging, voice and video calls, creator tools, live rooms, storytelling, and community features in one trusted experience. Our mission is simple: make digital communication feel personal, fast, and genuinely useful.
                    </p>
                </section>

                <section className="grid md:grid-cols-3 gap-4">
                    {pillars.map(({ icon: Icon, title, text }) => (
                        <div key={title} className="bg-white border border-[#EBEBEB] rounded-2xl p-5">
                            <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center mb-4">
                                <Icon size={18} className="text-[#00C300]" />
                            </div>
                            <h3 className="text-base font-bold text-[#111111] mb-2">{title}</h3>
                            <p className="text-sm text-[#8D8D8D] leading-relaxed">{text}</p>
                        </div>
                    ))}
                </section>

                <section className="bg-white border border-[#EBEBEB] rounded-3xl p-6 md:p-8">
                    <h3 className="text-xl font-bold text-[#111111] mb-3">Why people choose GaGa Chat</h3>
                    <ul className="space-y-3 text-sm text-[#8D8D8D] leading-relaxed">
                        <li>• Free, reliable communication without the friction of a VPN or complicated setup.</li>
                        <li>• Creator-friendly tools that help communities grow, monetize, and stay engaged.</li>
                        <li>• Privacy-first controls that help people feel safe sharing, connecting, and creating online.</li>
                        <li>• A unified experience combining chat, social discovery, live experiences, and commerce.</li>
                    </ul>
                </section>
            </div>
        </div>
    );
}
