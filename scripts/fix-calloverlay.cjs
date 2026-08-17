const fs = require('fs');

const p = 'src/components/calling/CallOverlay.tsx';
let c = fs.readFileSync(p, 'utf8');

const oldBlock = `        {/* ZEGO prebuilt UI container - full 1:1 call UI (video, controls, chat) */}
        {isZegoActive && (
          <div
            ref={zegocontainerRef}
            className="absolute inset-0 bg-black"
          />
        )}
        {/* Hide the legacy call UI when ZEGO's prebuilt UI is active */}
        {!isZegoActive && (`;

const newBlock = `        {/* ZEGO prebuilt UI container - ALWAYS mounted so ZEGO join() finds it.
            Invisible until ZEGO actually joins - prevents black screen. */}
        <div
          ref={zegocontainerRef}
          className={\`absolute inset-0 bg-black transition-opacity duration-300 \${showZegoUi ? 'opacity-100' : 'opacity-0'}\`}
        />
        {/* Show the legacy ring UI until ZEGO actually joins */}
        {!showZegoUi && (`;

if (c.includes(oldBlock)) {
    c = c.replace(oldBlock, newBlock);
    fs.writeFileSync(p, c);
    console.log('REPLACED_OK');
} else {
    console.log('PATTERN_NOT_FOUND');
}
</write_to_file >