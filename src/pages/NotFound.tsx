import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, MessageCircle, Search } from 'lucide-react';
import Logo from '@/components/Logo';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-white to-[#F5F5F5] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="text-center max-w-md w-full"
      >
        {/* Logo with 404 */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#00C300]/20"
        >
          <Logo size={48} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-6xl sm:text-7xl font-black text-[#111111] mb-2 tracking-tight">
            4<span className="text-[#00C300]">0</span>4
          </h1>
          <p className="text-lg font-semibold text-[#111111] mb-2">Page Not Found</p>
          <p className="text-[#8D8D8D] text-sm mb-8 leading-relaxed max-w-xs mx-auto">
            The page you are looking for does not exist or has been moved. Let us get you back on track.
          </p>
        </motion.div>

        {/* Suggested pages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3 mb-8"
        >
          <button
            type="button"
            onClick={() => navigate('/chats')}
            className="flex flex-col items-center gap-2 p-4 bg-white border border-[#EBEBEB] rounded-2xl hover:border-[#00C300]/30 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center group-hover:bg-[#00C300]/20 transition-colors">
              <MessageCircle size={20} className="text-[#00C300]" />
            </div>
            <span className="text-[#111111] text-sm font-medium">Chats</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/contacts')}
            className="flex flex-col items-center gap-2 p-4 bg-white border border-[#EBEBEB] rounded-2xl hover:border-[#00C300]/30 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center group-hover:bg-[#00C300]/20 transition-colors">
              <Search size={20} className="text-[#00C300]" />
            </div>
            <span className="text-[#111111] text-sm font-medium">People</span>
          </button>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-6 py-3 border border-[#EBEBEB] rounded-full text-[#111111] text-sm font-medium hover:bg-white hover:border-[#00C300]/30 transition-all"
          >
            <ArrowLeft size={16} /> Go Back
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#00C300] hover:bg-[#00A300] text-white rounded-full text-sm font-bold transition-colors shadow-lg shadow-[#00C300]/20"
          >
            <Home size={16} /> Back to Home
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
