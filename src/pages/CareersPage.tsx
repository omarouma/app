import { ArrowLeft, BriefcaseBusiness, HeartHandshake, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CareersPage() {
    const navigate = useNavigate();

    const values = [
        {
            icon: Sparkles,
            title: 'Build what matters',
            text: 'We design products that make daily communication simpler, more human, and more creative.',
        },
        {
            icon: HeartHandshake,
            title: 'Ship with empathy',
            text: 'Our teams think deeply about trust, safety, and the real experiences of people using the app every day.',
        },
        {
            icon: BriefcaseBusiness,
            title: 'Grow globally',
            text: 'We work at the intersection of product, community, and culture—building for users in Bangladesh and around the world.',
        },
    ];

    return (
        <div className="min-h-[100dvh] bg-[#F5F5F5]">
            <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
                <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full text-[#111111] hover:bg-[#F5F5F5]">
                    <ArrowLeft size={22} />
                </button>
                <h1 className="text-lg font-bold text-[#111111]">Careers</h1>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <section className="bg-white border border-[#EBEBEB] rounded-3xl p-6 md:p-8">
                    <h2 className="text-3xl font-bold text-[#111111] mb-3">Help build the next generation of social communication.</h2>
                    <p className="text-[#8D8D8D] leading-relaxed">
                        GaGa Chat is growing a team of thoughtful builders, designers, creators, and operators who care about community, trust, and product quality. If you want to shape the way people connect online, we’d love to hear from you.
                    </p>
                </section>

                <section className="grid md:grid-cols-3 gap-4">
                    {values.map(({ icon: Icon, title, text }) => (
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
                    <h3 className="text-xl font-bold text-[#111111] mb-3">Open roles</h3>
                    <div className="space-y-3 text-sm text-[#8D8D8D]">
                        <div className="flex items-center justify-between gap-3 border-b border-[#EBEBEB] pb-3">
                            <span className="font-medium text-[#111111]">Product Designer</span>
                            <span>Remote / Hybrid</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-b border-[#EBEBEB] pb-3">
                            <span className="font-medium text-[#111111]">Frontend Engineer</span>
                            <span>Remote</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[#111111]">Community & Safety Specialist</span>
                            <span>Remote</span>
                        </div>
                    </div>
                    <p className="mt-5 text-sm text-[#8D8D8D]">
                        Send your resume to <a href="mailto:careers@gagachat.app" className="text-[#00C300] underline">careers@gagachat.app</a> and tell us what kind of impact you want to build.
                    </p>
                </section>
            </div>
        </div>
    );
}
