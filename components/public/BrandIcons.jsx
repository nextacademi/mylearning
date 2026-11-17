// App-style icons for the homepage course cards, drawn in each product's
// own brand colours (Microsoft Word / Excel / PowerPoint, AutoCAD,
// ChatGPT) so visitors recognise the software they will learn. Simple
// inline SVGs — no external image files or icon packages.

function OfficeIcon({ letter, dark, light, size, children, title }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={title}>
      <rect x="15" y="6" width="29" height="36" rx="4" fill={light} />
      {children}
      <rect x="4" y="12" width="24" height="24" rx="4" fill={dark} />
      <text x="16" y="29.6" textAnchor="middle" fontFamily="Segoe UI, Arial, sans-serif" fontWeight="700" fontSize="15" fill="#fff">
        {letter}
      </text>
    </svg>
  );
}

export function WordIcon({ size = 40 }) {
  return (
    <OfficeIcon letter="W" dark="#185ABD" light="#41A5EE" size={size} title="Microsoft Word">
      <path d="M30 13h10M30 19h10M30 25h10M30 31h10M30 37h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
    </OfficeIcon>
  );
}

export function ExcelIcon({ size = 40 }) {
  return (
    <OfficeIcon letter="X" dark="#107C41" light="#21A366" size={size} title="Microsoft Excel">
      <path d="M29 10v28M36.5 10v28M15 18h29M15 26h29M15 34h29" stroke="#fff" strokeWidth="1.8" opacity="0.75" />
    </OfficeIcon>
  );
}

export function PowerPointIcon({ size = 40 }) {
  return (
    <OfficeIcon letter="P" dark="#C43E1C" light="#ED6C47" size={size} title="Microsoft PowerPoint">
      <circle cx="35" cy="24" r="7" fill="#FFB49A" />
      <path d="M35 24V17a7 7 0 0 1 7 7z" fill="#fff" />
    </OfficeIcon>
  );
}

export function AutoCadIcon({ size = 52 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="AutoCAD">
      <rect x="3" y="3" width="42" height="42" rx="9" fill="#C8102E" />
      <rect x="3" y="3" width="42" height="21" rx="9" fill="#E0293F" opacity="0.55" />
      <path d="M12.5 37 22 11h4l9.5 26h-5.6l-2-5.8h-7.8l-2 5.8zm9.3-10.4h4.4L24 20z" fill="#fff" />
    </svg>
  );
}

export function ChatGptIcon({ size = 44 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="ChatGPT">
      <rect x="3" y="3" width="42" height="42" rx="11" fill="#10A37F" />
      <g fill="none" stroke="#fff" strokeWidth="2.6" transform="translate(24 24)">
        {[0, 60, 120].map((angle) => (
          <rect key={angle} x="-5.5" y="-12.5" width="11" height="25" rx="5.5" transform={`rotate(${angle})`} />
        ))}
      </g>
    </svg>
  );
}
