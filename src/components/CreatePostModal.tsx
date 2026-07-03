import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { toast } from 'sonner';
import {
  Image, MapPin, BarChart2, Calendar, EyeOff, X, Link,
  Smile, Send, Globe, Lock, Users, UserCheck, ChevronDown, Plus, Minus, Clock
} from 'lucide-react';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPost?: () => void;
}

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, desc: 'Anyone can see' },
  { value: 'friends', label: 'Friends', icon: Users, desc: 'Only your friends' },
  { value: 'followers', label: 'Followers', icon: UserCheck, desc: 'Only your followers' },
  { value: 'private', label: 'Only Me', icon: Lock, desc: 'Only you' },
  { value: 'close_friends', label: 'Close Friends', icon: UserCheck, desc: 'Your close friends list' },
] as const;

const PRESET_LOCATIONS = [
  'New York, NY', 'Los Angeles, CA', 'London, UK', 'Paris, France',
  'Tokyo, Japan', 'New York, USA', 'Mumbai, India', 'Dubai, UAE',
  'Sydney, Australia', 'Berlin, Germany', 'Toronto, Canada', 'São Paulo, Brazil',
];

const EMOJIS = ['😀','😂','😍','😎','🤔','😭','😡','🥳','🤩','😴','🤮','👏','🔥','❤️','💯','🙏','💪','🎉','🌟','🎵','📸','🍕','✈️','🏆','🎮','🎬','💼','🎓','🏠','🚗','🌈','🌊','🌅','🌺','🐶','🐱','🦋','🌻','☕','🍦','🍔','🍣','🎂','🍺','🍷','🍹','🥂','🍾','🎁','🎄','🎃','🎅','👻','🤡','👽','🤖','💩','👍','👎','👌','🤞','✌️','🤟','🤘','👊','🤛','🤜','👋','🤚','🖐️','✋','🖖','👇','☝️','👆','🖕','✍️','🤳','💅','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👩‍🍼','👨‍🍼','🧑‍🍼','👼','🎅','🤶','🧑‍🎄','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴️','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','🛀','🛌','🧑‍🤝‍🧑','👭','👬','👫','💏','💑','👪','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👦‍👦','👨‍👩‍👧‍👧','👩‍👩‍👦','👩‍👩‍👧','👩‍👩‍👧‍👦','👩‍👩‍👦‍👦','👩‍👩‍👧‍👧','👨‍👨‍👦','👨‍👨‍👧','👨‍👨‍👧‍👦','👨‍👨‍👦‍👦','👨‍👨‍👧‍👧','👩‍👦','👩‍👧','👩‍👧‍👦','👩‍👦‍👦','👩‍👧‍👧','👨‍👦','👨‍👧','👨‍👧‍👦','👨‍👦‍👦','👨‍👧‍👧','🧑‍🧑‍🧒','🧑‍🧑‍🧒‍🧒','🧑‍🧒','🧑‍🧒‍🧒','🗣️','👤','👥','🫂','👣','🐵','🐒','🦍','🦧','🐶','🐕','🦮','🐩','🐺','🦊','🦝','🐱','🐈','🦁','🐯','🐅','🐆','🐴','🐎','🦄','🦓','🦌','🦬','🐮','🐂','🐃','🐄','🐷','🐖','🐗','🐽','🐏','🐑','🐐','🐪','🐫','🦙','🦒','🐘','🦣','🦏','🦛','🐭','🐁','🐀','🐹','🐰','🐇','🐿️','🦫','🦔','🦇','🐻','🐨','🐼','🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐔','🐓','🐣','🐤','🐥','🐦','🐧','🕊️','🦅','🦆','🦢','🦉','🦤','🪶','🦩','🦚','🦜','🐸','🐊','🐢','🦎','🐍','🐲','🐉','🦕','🦖','🐳','🐋','🐬','🦭','🐟','🐠','🐡','🦈','🐙','🐚','🐌','🦋','🐛','🐜','🐝','🪲','🐞','🦗','🪳','🕷️','🕸️','🦂','🦟','🪰','🪱','🦠','💐','🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🪴','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧃','🧉','🧊','🥢','🍽️','🍴','🥄','🔪','🏺','🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🎡','🎢','💈','🎪','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🏍️','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','🛢️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','⛵','🛶','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🛎️','🧳','⌛','⏳','⌚','⏰','⏱️','⏲️','🕰️','🕛','🕧','🕐','🕜','🕑','🕝','🕒','🕞','🕓','🕟','🕔','🕠','🕕','🕡','🕖','🕢','🕗','🕣','🕘','🕤','🕙','🕥','🕚','🕦','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚','🌛','🌜','🌡️','☀️','🌝','🌞','🪐','⭐','🌟','🌠','🌌','☁️','⛅','⛈️','🌤️','🌥️','🌦️','🌧️','🌨️','❄️','🌬️','💨','🌪️','🌫️','🌈','☔','☂️','💧','💦','🌊','💎','🔥','⭐','🌟','✨','💫','💥','💢','💦','💧','🎊','🎉','🎀','🎁','🎗️','🏆','🏅','🥇','🥈','🥉','⚽','⚾','🥎','🏀','🏐','🏈','🏉','🎾','🥏','🎳','🏏','🏑','🏒','🥍','🏓','🏸','🥊','🥋','🥅','⛳','⛸️','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪀','🪁','🎱','🔮','🪄','🧿','🪬','🎮','🕹️','🎰','🎲','🧩','🧸','🪅','🪆','🎭','🖼️','🎨','🧵','🪡','🧶','🪢','👓','🕶️','🥽','🥼','🦺','👔','👕','👖','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🛍️','🎒','🩴','👞','👟','🥾','🥿','👠','👡','🩰','👢','👑','👒','🎩','🎓','🧢','🪖','⛑️','📿','💄','💅','🪞','🪳','🪥','🪮','🪒','🪬','🪭','🪮','🪯','🪰','🪱','🪲','🪳','🪴','🪵','🪶','🫀','🫁','🫂','🫃','🫄','🫅','🫎','🫏','🫐','🫑','🫒','🫓','🫔','🫕','🫖','🫗','🫘','🫙','🫚','🫛','🫜','🫝','🫞','🫟','🫠','🫡','🫢','🫣','🫤','🫥','🫦','🫧','🫨','🫩','🫪','🫫','🫬','🫭','🫮','🫯','🫰','🫱','🫲','🫳','🫴','🫵','🫶','🫷','🫸','🫹','🫺','🫻','🫼','🫽','🫾','🫿','🟰','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🟰','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🟰','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂','▶️','⏩','⏭️','⏯️','◀️','⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️','⏏️','🎦','🔅','🔆','📶','📳','📴','♀️','♂️','⚧️','✖️','➕','➖','➗','♾️','‼️','⁉️','❓','❔','❕','❗','〰️','💱','💲','⚕️','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➰','➿','〽️','✳️','✴️','❇️','©️','®️','™️','#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔠','🔡','🔢','🔣','🔤','🅰️','🅱️','🆎','🅾️','🆑','🆒','🆓','ℹ️','🆔','Ⓜ️','🆕','🆖','🆗','🅿️','🆘','🆙','🆚','🈁','🈂️','🈷️','🈶','🈯','🉐','🈹','🈚','🈲','🉑','🈸','🈴','🈳','㊗️','㊙️','🈺','🈵','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🟰','⬛','⬜','◼️','◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔳','🔲','🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇦🇨','🇦🇩','🇦🇪','🇦🇫','🇦🇬','🇦🇮','🇦🇱','🇦🇲','🇦🇴','🇦🇶','🇦🇷','🇦🇸','🇦🇹','🇦🇺','🇦🇼','🇦🇽','🇦🇿','🇧🇦','🇧🇧','🇧🇩','🇧🇪','🇧🇫','🇧🇬','🇧🇭','🇧🇮','🇧🇯','🇧🇱','🇧🇲','🇧🇳','🇧🇴','🇧🇶','🇧🇷','🇧🇸','🇧🇹','🇧🇻','🇧🇼','🇧🇾','🇧🇿','🇨🇦','🇨🇨','🇨🇩','🇨🇫','🇨🇬','🇨🇭','🇨🇮','🇨🇰','🇨🇱','🇨🇲','🇨🇳','🇨🇴','🇨🇵','🇨🇷','🇨🇺','🇨🇻','🇨🇼','🇨🇽','🇨🇾','🇨🇿','🇩🇪','🇩🇬','🇩🇯','🇩🇰','🇩🇲','🇩🇴','🇩🇿','🇪🇦','🇪🇨','🇪🇪','🇪🇬','🇪🇭','🇪🇷','🇪🇸','🇪🇹','🇪🇺','🇫🇮','🇫🇯','🇫🇰','🇫🇲','🇫🇴','🇫🇷','🇬🇦','🇬🇧','🇬🇩','🇬🇪','🇬🇫','🇬🇬','🇬🇭','🇬🇮','🇬🇱','🇬🇲','🇬🇳','🇬🇵','🇬🇶','🇬🇷','🇬🇸','🇬🇹','🇬🇺','🇬🇼','🇬🇾','🇭🇰','🇭🇲','🇭🇳','🇭🇷','🇭🇹','🇭🇺','🇮🇨','🇮🇩','🇮🇪','🇮🇱','🇮🇲','🇮🇳','🇮🇴','🇮🇶','🇮🇷','🇮🇸','🇮🇹','🇯🇪','🇯🇲','🇯🇴','🇯🇵','🇰🇪','🇰🇬','🇰🇭','🇰🇮','🇰🇲','🇰🇳','🇰🇵','🇰🇷','🇰🇼','🇰🇾','🇰🇿','🇱🇦','🇱🇧','🇱🇨','🇱🇮','🇱🇰','🇱🇷','🇱🇸','🇱🇹','🇱🇺','🇱🇻','🇱🇾','🇲🇦','🇲🇨','🇲🇩','🇲🇪','🇲🇫','🇲🇬','🇲🇭','🇲🇰','🇲🇱','🇲🇲','🇲🇳','🇲🇴','🇲🇵','🇲🇶','🇲🇷','🇲🇸','🇲🇹','🇲🇺','🇲🇻','🇲🇼','🇲🇽','🇲🇾','🇲🇿','🇳🇦','🇳🇨','🇳🇪','🇳🇫','🇳🇬','🇳🇮','🇳🇱','🇳🇴','🇳🇵','🇳🇷','🇳🇺','🇳🇿','🇴🇲','🇵🇦','🇵🇪','🇵🇫','🇵🇬','🇵🇭','🇵🇰','🇵🇱','🇵🇲','🇵🇳','🇵🇷','🇵🇸','🇵🇹','🇵🇼','🇵🇾','🇶🇦','🇷🇪','🇷🇴','🇷🇸','🇷🇺','🇷🇼','🇸🇦','🇸🇧','🇸🇨','🇸🇩','🇸🇪','🇸🇬','🇸🇭','🇸🇮','🇸🇯','🇸🇰','🇸🇱','🇸🇲','🇸🇳','🇸🇴','🇸🇷','🇸🇸','🇸🇹','🇸🇻','🇸🇽','🇸🇾','🇸🇿','🇹🇦','🇹🇨','🇹🇩','🇹🇫','🇹🇬','🇹🇭','🇹🇯','🇹🇰','🇹🇱','🇹🇲','🇹🇳','🇹🇴','🇹🇷','🇹🇹','🇹🇻','🇹🇼','🇹🇿','🇺🇦','🇺🇬','🇺🇲','🇺🇳','🇺🇸','🇺🇾','🇺🇿','🇻🇦','🇻🇨','🇻🇪','🇻🇬','🇻🇮','🇻🇳','🇻🇺','🇼🇫','🇼🇸','🇽🇰','🇾🇪','🇾🇹','🇿🇦','🇿🇲','🇿🇼','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿'];

export default function CreatePostModal({ isOpen, onClose, onPost }: CreatePostModalProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'followers' | 'private' | 'close_friends'>('public');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [contentWarning, setContentWarning] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [, setLinkPreview] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [, setMentionQuery] = useState('');
  const [, setShowMentions] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const { createPost } = useEnhancedTimelineStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = content.length;
  const maxChars = 2200;

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages((prev) => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions((prev) => [...prev, '']);
  };

  const removePollOption = (idx: number) => {
    if (pollOptions.length > 2) setPollOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePollOption = (idx: number, val: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  };

  const extractHashtags = useCallback((text: string) => {
    const tags = text.match(/#[\w\u0080-\uFFFF]+/g) || [];
    return tags.map((t) => t.slice(1).toLowerCase());
  }, []);

  const handleContentChange = (val: string) => {
    setContent(val);
    const tags = extractHashtags(val);
    setHashtags(tags);
    const lastWord = val.split(/\s/).pop() || '';
    if (lastWord.startsWith('@')) {
      setMentionQuery(lastWord.slice(1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handlePost = async () => {
    if (!content.trim() && images.length === 0 && !showPoll) {
      toast.error('Please add some content');
      return;
    }
    if (charCount > maxChars) {
      toast.error(`Content too long (max ${maxChars} chars)`);
      return;
    }
    setIsPosting(true);
    try {
      void (showPoll && pollQuestion && pollOptions.every((o) => o.trim())
        ? {
            question: pollQuestion,
            options: pollOptions.map((text) => ({ text, votes: [] })),
            totalVotes: 0,
          }
        : undefined);

      await createPost(user?.id || '', content, images, privacy);
      toast.success('Post created!');
      setContent('');
      setImages([]);
      setPollQuestion('');
      setPollOptions(['', '']);
      setShowPoll(false);
      setLocation('');
      setContentWarning(false);
      setScheduledDate('');
      setShowSchedule(false);
      setLinkPreview('');
      setHashtags([]);
      onPost?.();
      onClose();
    } catch {
      toast.error('Failed to create post');
    } finally {
      setIsPosting(false);
    }
  };

  const privacyOption = PRIVACY_OPTIONS.find((p) => p.value === privacy);
  const PrivacyIcon = privacyOption?.icon || Globe;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-lg text-gray-900">Create Post</h2>
              <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* User info */}
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="User avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 text-sm font-bold">{(user?.name || 'U')[0]}</span>
                )}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{user?.name || 'User'}</p>
                <button type="button" onClick={() => setShowPrivacy(!showPrivacy)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"
                >
                  <PrivacyIcon size={12} />
                  {privacyOption?.label || 'Public'}
                  <ChevronDown size={10} />
                </button>
              </div>
            </div>

            {/* Privacy dropdown */}
            <AnimatePresence>
              {showPrivacy && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4"
                >
                  <div className="bg-gray-50 rounded-xl p-2 space-y-1">
                    {PRIVACY_OPTIONS.map((opt) => (
                      <button type="button" key={opt.value}
                        onClick={() => { setPrivacy(opt.value); setShowPrivacy(false); }}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${privacy === opt.value ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
                      >
                        <opt.icon size={16} className={privacy === opt.value ? 'text-[#00C300]' : 'text-gray-400'} />
                        <div>
                          <p className={`text-sm font-medium ${privacy === opt.value ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                          <p className="text-xs text-gray-400">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="px-4 pb-2">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full min-h-[120px] resize-none text-gray-900 placeholder-gray-400 text-base outline-none"
                maxLength={maxChars}
              />
            </div>

            {/* Image previews */}
            {images.length > 0 && (
              <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
                {images.map((img, idx) => (
                  <div key={idx} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <img src={img} alt="Cover image" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeImage(idx)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Poll */}
            <AnimatePresence>
              {showPoll && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase">Poll</p>
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Ask a question..."
                      className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                    />
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updatePollOption(idx, e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                        />
                        {pollOptions.length > 2 && (
                          <button type="button" onClick={() => removePollOption(idx)} className="p-1 hover:bg-gray-200 rounded">
                            <Minus size={14} className="text-gray-400" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 4 && (
                      <button type="button" onClick={addPollOption} className="flex items-center gap-1 text-xs text-[#00C300] font-medium">
                        <Plus size={12} /> Add option
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Location */}
            <AnimatePresence>
              {showLocation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  <div className="bg-gray-50 rounded-xl p-2 flex flex-wrap gap-1">
                    {PRESET_LOCATIONS.slice(0, 8).map((loc) => (
                      <button type="button" key={loc}
                        onClick={() => { setLocation(loc); setShowLocation(false); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${location === loc ? 'bg-[#00C300] text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Schedule */}
            <AnimatePresence>
              {showSchedule && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">Schedule Post</p>
                    <input
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Emoji picker */}
            <AnimatePresence>
              {showEmoji && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  <div className="bg-gray-50 rounded-xl p-2 max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {EMOJIS.slice(0, 60).map((emoji, idx) => (
                        <button type="button" key={idx}
                          onClick={() => { setContent((c) => c + emoji); setShowEmoji(false); }}
                          className="text-lg hover:bg-gray-200 rounded p-1 transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hashtags display */}
            {hashtags.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1">
                {hashtags.slice(0, 5).map((tag) => (
                  <span key={tag} className="text-xs text-[#00C300] font-medium bg-[#00C300]/10 px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            )}

            {/* Content warning toggle */}
            <div className="px-4 pb-2 flex items-center gap-2">
              <button type="button" onClick={() => setContentWarning(!contentWarning)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${contentWarning ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}
              >
                <EyeOff size={12} />
                {contentWarning ? 'Sensitive Content' : 'Content Warning'}
              </button>
              {location && (
                <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  <MapPin size={10} /> {location}
                </span>
              )}
              {scheduledDate && (
                <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  <Clock size={10} /> {new Date(scheduledDate).toLocaleString()}
                </span>
              )}
            </div>

            {/* Character count */}
            <div className="px-4 pb-2 flex justify-end">
              <span className={`text-xs ${charCount > maxChars ? 'text-red-500' : charCount > maxChars * 0.8 ? 'text-amber-500' : 'text-gray-400'}`}>
                {charCount}/{maxChars}
              </span>
            </div>

            {/* Toolbar */}
            <div className="px-4 pb-3 flex items-center gap-1 flex-wrap">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />
              <button type="button" onClick={handleImageUpload} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Photo/Video">
                <Image size={20} className="text-[#00C300]" />
              </button>
              <button type="button" onClick={() => setShowPoll(!showPoll)} className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${showPoll ? 'bg-[#00C300]/10' : ''}`} title="Poll">
                <BarChart2 size={20} className={showPoll ? 'text-[#00C300]' : 'text-gray-500'} />
              </button>
              <button type="button" onClick={() => setShowLocation(!showLocation)} className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${location ? 'bg-[#00C300]/10' : ''}`} title="Location">
                <MapPin size={20} className={location ? 'text-[#00C300]' : 'text-gray-500'} />
              </button>
              <button type="button" onClick={() => setShowEmoji(!showEmoji)} className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${showEmoji ? 'bg-[#00C300]/10' : ''}`} title="Emoji">
                <Smile size={20} className={showEmoji ? 'text-[#00C300]' : 'text-gray-500'} />
              </button>
              <button type="button" onClick={() => setShowSchedule(!showSchedule)} className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${scheduledDate ? 'bg-[#00C300]/10' : ''}`} title="Schedule">
                <Calendar size={20} className={scheduledDate ? 'text-[#00C300]' : 'text-gray-500'} />
              </button>
              <button type="button" onClick={() => { setLinkPreview(''); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Link">
                <Link size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Post button */}
            <div className="px-4 pb-4">
              <button type="button" onClick={handlePost}
                disabled={isPosting || (charCount > maxChars)}
                className="w-full py-3 bg-[#00C300] text-white rounded-xl font-bold text-sm hover:bg-[#00b000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPosting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Post
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
