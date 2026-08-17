import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus } from 'lucide-react';

interface TimelineHeaderProps {
    showPostSearch: boolean;
    setShowPostSearch: (show: boolean) => void;
    setShowComposer: (show: boolean) => void;
    postSearch: string;
    setPostSearch: (search: string) => void;
}

const TimelineHeader: React.FC<TimelineHeaderProps> = ({
    showPostSearch,
    setShowPostSearch,
    setShowComposer,
    postSearch,
    setPostSearch,
}) => {
    return (
        <div className="sticky top-0 z-30 bg-background/75 backdrop-blur-nav border-b border-border">
            <div className="flex items-center justify-between p-4">
                <h1 className="text-2xl font-bold text-foreground">GaGa</h1>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowPostSearch(!showPostSearch)}
                        className="p-2 text-foreground"
                    >
                        <Search size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowComposer(true)}
                        className="p-2 text-primary-foreground bg-primary rounded-full"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>
            <AnimatePresence>
                {showPostSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4"
                    >
                        <input
                            type="text"
                            value={postSearch}
                            onChange={(e) => setPostSearch(e.target.value)}
                            placeholder="Search posts..."
                            className="w-full bg-muted text-foreground focus:ring-primary rounded-full px-4 py-2 focus:outline-none focus:ring-2"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TimelineHeader;