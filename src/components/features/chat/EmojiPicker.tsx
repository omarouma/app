import { useState } from 'react';

const RECENT_KEY = 'emoji_recent';
const MAX_RECENT = 16;

function getRecentEmojis(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function addRecentEmoji(emoji: string) {
  const recent = getRecentEmojis().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

const emojiCategories: Record<string, string[]> = {
  'Recent': [],
  'Smileys': ['\u{1F600}', '\u{1F601}', '\u{1F602}', '\u{1F603}', '\u{1F604}', '\u{1F605}', '\u{1F606}', '\u{1F609}', '\u{1F60A}', '\u{1F60B}', '\u{1F60E}', '\u{1F60D}', '\u{1F618}', '\u{1F617}', '\u{1F619}', '\u{1F61A}', '\u{1F642}', '\u{1F917}', '\u{1F914}', '\u{1F610}', '\u{1F611}', '\u{1F636}', '\u{1F644}', '\u{1F60F}', '\u{1F623}', '\u{1F625}', '\u{1F62E}', '\u{1F910}', '\u{1F62F}', '\u{1F62A}', '\u{1F62B}', '\u{1F634}', '\u{1F60C}', '\u{1F61B}', '\u{1F61C}', '\u{1F61D}', '\u{1F924}', '\u{1F612}', '\u{1F613}', '\u{1F614}', '\u{1F615}', '\u{1F643}', '\u{1F911}', '\u{1F632}', '\u{2639}', '\u{1F641}', '\u{1F616}', '\u{1F61E}', '\u{1F61F}', '\u{1F624}', '\u{1F622}', '\u{1F62D}', '\u{1F626}', '\u{1F627}', '\u{1F628}', '\u{1F629}', '\u{1F62C}', '\u{1F630}', '\u{1F631}', '\u{1F633}', '\u{1F635}', '\u{1F621}', '\u{1F620}', '\u{1F608}', '\u{1F47F}', '\u{1F479}', '\u{1F47A}'],
  'Hearts': ['\u{2764}', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F90E}', '\u{1F5A4}', '\u{1F90D}', '\u{1F48B}', '\u{1F498}', '\u{1F49D}', '\u{1F496}', '\u{1F497}', '\u{1F493}', '\u{1F49E}', '\u{1F495}', '\u{1F49F}', '\u{2763}', '\u{1F494}'],
  'Hands': ['\u{1F44B}', '\u{1F91A}', '\u{1F590}', '\u{270B}', '\u{1F596}', '\u{1F44C}', '\u{1F90F}', '\u{270C}', '\u{1F91E}', '\u{1F91F}', '\u{1F918}', '\u{1F919}', '\u{1F448}', '\u{1F449}', '\u{1F446}', '\u{1F595}', '\u{1F447}', '\u{261D}', '\u{1F44D}', '\u{1F44E}', '\u{270A}', '\u{1F44A}', '\u{1F91B}', '\u{1F91C}', '\u{1F44F}', '\u{1F64C}', '\u{1F450}', '\u{1F932}', '\u{1F91D}', '\u{1F64F}', '\u{270D}', '\u{1F485}', '\u{1F933}'],
  'Celebration': ['\u{1F381}', '\u{1F38E}', '\u{1F3EE}', '\u{1F389}', '\u{1F38A}', '\u{1F388}', '\u{1F382}', '\u{1F387}', '\u{2728}', '\u{1F9E8}', '\u{1F38B}', '\u{1F38D}', '\u{1F38F}', '\u{1F490}', '\u{1F380}'],
  'GaGa': ['\u{1F9D9}', '\u{1F47E}', '\u{1F916}', '\u{1F47B}', '\u{1F63A}', '\u{1F638}', '\u{1F639}', '\u{1F63B}', '\u{1F63C}', '\u{1F63D}', '\u{1F640}', '\u{1F63F}', '\u{1F63E}', '\u{1F648}', '\u{1F649}', '\u{1F64A}']
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => getRecentEmojis());
  const [activeTab, setActiveTab] = useState<string>(() => getRecentEmojis().length > 0 ? 'Recent' : 'Smileys');

  const handleSelect = (emoji: string) => {
    addRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    onEmojiSelect(emoji);
  };

const categories: Record<string, string[]> = { ...emojiCategories, Recent: recentEmojis };
  const tabs = recentEmojis.length > 0
    ? Object.keys(categories)
    : Object.keys(categories).filter(k => k !== 'Recent');

  return (
    <div className="w-full">
      <div className="flex gap-1 mb-2 border-b border-[#EBEBEB] pb-2 overflow-x-auto scrollbar-hide">
        {tabs.map(cat => (
          <button type="button" key={cat}
            onClick={() => setActiveTab(cat)}
            className={`text-xs px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
              activeTab === cat ? 'bg-[#00C300] text-white' : 'text-[#8D8D8D] hover:text-[#111111] hover:bg-[#F5F5F5]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto scrollbar-hide p-1">
        {(categories[activeTab] ?? []).map((emoji, i) => (
          <button type="button" key={`${emoji}-${i}`}
            className="text-xl hover:bg-[#F5F5F5] rounded p-1 transition-colors"
            onClick={() => handleSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
        {(categories[activeTab] ?? []).length === 0 && (
          <p className="col-span-8 text-center text-[#8D8D8D] text-xs py-4">No recent emojis yet</p>
        )}
      </div>
    </div>
  );
}
