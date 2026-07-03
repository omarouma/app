import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  delay: number;
}

export default function FeatureCard({ icon: Icon, title, description, delay }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay }}
      className="bg-[#F5F5F5] border border-[#EBEBEB] hover:border-[#00C300]/30 rounded-2xl p-6 transition-all duration-300 group"
    >
      <div className="w-12 h-12 rounded-xl bg-[#00C300]/10 flex items-center justify-center mb-4 group-hover:bg-[#00C300]/20 transition-colors">
        <Icon size={24} className="text-[#00C300]" />
      </div>
      <h3 className="text-[#111111] font-semibold text-base mb-2">{title}</h3>
      <p className="text-[#8D8D8D] text-sm leading-relaxed">{description}</p>
    </motion.div>
  );
}
