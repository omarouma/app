import { ArrowLeft, BookOpen, CalendarDays, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const posts = [
    {
        title: 'How creators grow communities that actually convert',
        date: 'April 2026',
        summary: 'A practical playbook for building trust, engagement, and recurring support through live interactions and better content systems.',
    },
    {
        title: 'Privacy-first messaging: what users really expect',
        date: 'March 2026',
        summary: 'The features people care about most—account control, clarity, and peace of mind—when choosing their communication tools.',
    },
    {
        title: 'Why communities are replacing simple chats',
        date: 'February 2026',
        summary: 'Modern digital communication is moving toward social layers, creator ecosystems, and richer everyday experiences.',
    },
];

export default function BlogPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-[100dvh] bg-secondary">
            <div className="bg-card border-b border-border flex items-center gap-3 p-4">
                <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full text-foreground hover:bg-secondary">
                    <ArrowLeft size={22} />
                </button>
                <h1 className="text-lg font-bold text-foreground">GaGa Chat Blog</h1>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
                <section className="bg-card border border-border rounded-3xl p-6 md:p-8">
                    <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-4">
                        <BookOpen size={14} className="text-primary" />
                        <span className="text-primary text-sm font-medium">Insights & product notes</span>
                    </div>
                    <h2 className="text-3xl font-bold text-foreground mb-3">Fresh thinking for global communities.</h2>
                    <p className="text-muted-foreground leading-relaxed max-w-2xl">
                        Explore ideas around creator growth, digital trust, community experiences, and what makes social apps genuinely useful in the modern world.
                    </p>
                </section>

                {posts.map((post) => (
                    <article key={post.title} className="bg-card border border-border rounded-2xl p-5 md:p-6 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-2 text-primary text-xs font-medium mb-3">
                            <CalendarDays size={12} />
                            {post.date}
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">{post.title}</h3>
                        <p className="text-muted-foreground leading-relaxed mb-4">{post.summary}</p>
                        <Link to="/help" className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary">
                            Read more <ChevronRight size={14} />
                        </Link>
                    </article>
                ))}
            </div>
        </div>
    );
}
