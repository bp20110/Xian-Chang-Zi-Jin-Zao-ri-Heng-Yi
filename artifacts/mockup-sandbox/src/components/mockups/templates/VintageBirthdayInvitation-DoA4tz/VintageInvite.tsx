import React from 'react';

export default function VintageInvite() {
  return (
    <div 
      className="relative w-full h-full overflow-hidden" 
      style={{ 
        backgroundColor: '#f5f2eb',
        '--ink-black': '#1c1a17',
        '--ink-orange': '#e84e36',
        '--paper-bg': '#f5f2eb',
      } as React.CSSProperties}
    >
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Yellowtail&family=Rye&family=Bebas+Neue&family=Alfa+Slab+One&display=swap');
        
        .halftone-holes {
          -webkit-mask-image: radial-gradient(circle, transparent 20%, black 25%);
          -webkit-mask-size: 8px 8px;
          mask-image: radial-gradient(circle, transparent 20%, black 25%);
          mask-size: 8px 8px;
        }

        .noise-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
          mix-blend-mode: multiply;
          z-index: 50;
        }
        
        .ink-stamp {
          filter: drop-shadow(0px 1px 0px rgba(255,255,255,0.4));
        }

        .knockout-text {
          text-shadow: 
            -4px -4px 0 var(--paper-bg),
             0   -4px 0 var(--paper-bg),
             4px -4px 0 var(--paper-bg),
             4px  0   0 var(--paper-bg),
             4px  4px 0 var(--paper-bg),
             0    4px 0 var(--paper-bg),
            -4px  4px 0 var(--paper-bg),
            -4px  0   0 var(--paper-bg);
        }
      `}} />

      {/* Background Noise */}
      <div className="noise-overlay" />

      {/* Inner border / frame (optional print registration mark vibe) */}
      <div className="absolute inset-4 border border-[var(--ink-black)] opacity-20 pointer-events-none" />
      <div className="absolute inset-5 border border-[var(--ink-black)] opacity-10 pointer-events-none" />

      {/* Upper Right Pennants */}
      <svg className="absolute top-2 right-2 w-[340px] h-[200px] drop-shadow-sm z-20 pointer-events-none" viewBox="0 0 300 150">
        <path d="M 0,20 Q 150,110 300,-10" fill="none" stroke="var(--ink-black)" strokeWidth="1.5" />
        
        <g transform="translate(35, 40) rotate(18)">
          <polygon points="-16,0 16,0 0,45" fill="var(--ink-orange)" stroke="var(--ink-black)" strokeWidth="1.5" strokeLinejoin="round"/>
          <text y="24" fill="var(--paper-bg)" fontSize="20" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle">P</text>
        </g>
        
        <g transform="translate(90, 64) rotate(8)">
          <polygon points="-16,0 16,0 0,45" fill="var(--paper-bg)" stroke="var(--ink-black)" strokeWidth="1.5" strokeLinejoin="round"/>
          <text y="24" fill="var(--ink-black)" fontSize="20" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle">A</text>
        </g>

        <g transform="translate(150, 71) rotate(-2)">
          <polygon points="-16,0 16,0 0,45" fill="var(--ink-orange)" stroke="var(--ink-black)" strokeWidth="1.5" strokeLinejoin="round"/>
          <text y="24" fill="var(--paper-bg)" fontSize="20" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle">R</text>
        </g>

        <g transform="translate(210, 62) rotate(-12)">
          <polygon points="-16,0 16,0 0,45" fill="var(--paper-bg)" stroke="var(--ink-black)" strokeWidth="1.5" strokeLinejoin="round"/>
          <text y="24" fill="var(--ink-black)" fontSize="20" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle">T</text>
        </g>

        <g transform="translate(265, 37) rotate(-22)">
          <polygon points="-16,0 16,0 0,45" fill="var(--ink-orange)" stroke="var(--ink-black)" strokeWidth="1.5" strokeLinejoin="round"/>
          <text y="24" fill="var(--paper-bg)" fontSize="20" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle">Y</text>
        </g>
      </svg>

      {/* Top Arc Text */}
      <div className="absolute top-[8%] w-full flex justify-center z-10 pointer-events-none">
        <svg width="600" height="180" viewBox="0 0 600 180" className="overflow-visible">
          <path id="curve" d="M 50,160 Q 300,-10 550,160" fill="transparent" />
          <text width="600">
            <textPath href="#curve" startOffset="50%" textAnchor="middle" fill="var(--ink-black)" fontSize="58" fontFamily="'Bebas Neue', sans-serif" letterSpacing="10">
              BIRTHDAY PARTY
            </textPath>
          </text>
        </svg>
      </div>

      {/* Giant "30" */}
      <div className="absolute top-[18%] w-full flex justify-center z-0 pointer-events-none">
        <span 
          className="halftone-holes select-none tracking-tighter" 
          style={{ 
            fontFamily: "'Abril Fatface', serif",
            color: 'var(--ink-orange)',
            fontSize: '380px',
            lineHeight: '1',
          }}
        >
          30
        </span>
      </div>

      {/* "You're Invited" */}
      <div className="absolute top-[42%] w-full flex justify-center z-10 pointer-events-none -rotate-6">
        <span 
          className="select-none knockout-text" 
          style={{ 
            fontFamily: "'Yellowtail', cursive",
            color: 'var(--ink-black)',
            fontSize: '110px',
            lineHeight: '0.9',
          }}
        >
          You're Invited
        </span>
      </div>

      {/* Lower Third */}
      <div className="absolute bottom-[6%] w-full flex flex-col items-center z-10 pointer-events-none">
        {/* Diamond Separator */}
        <div className="flex items-center gap-6 mb-7">
          <div className="w-20 h-[2px]" style={{ backgroundColor: 'var(--ink-black)' }} />
          <div className="w-3.5 h-3.5 rotate-45" style={{ backgroundColor: 'var(--ink-orange)' }} />
          <div className="w-20 h-[2px]" style={{ backgroundColor: 'var(--ink-black)' }} />
        </div>

        {/* Date / Time */}
        <div className="text-[26px] uppercase tracking-[0.25em] mb-7 ink-stamp -rotate-1" style={{ fontFamily: "'Bebas Neue', sans-serif", color: 'var(--ink-black)' }}>
          Saturday <span style={{ color: 'var(--ink-orange)' }} className="mx-2">August</span> 22 <span className="mx-2 font-serif font-bold text-xl align-middle" style={{ color: 'var(--ink-black)' }}>·</span> 7 PM
        </div>

        {/* Complex Separator */}
        <div className="flex items-center gap-5 mb-8">
          <div className="w-28 h-[1px]" style={{ backgroundColor: 'var(--ink-black)' }} />
          <div className="w-5 h-5 rotate-45 border-[2px] flex items-center justify-center" style={{ borderColor: 'var(--ink-black)' }}>
            <div className="w-2 h-2" style={{ backgroundColor: 'var(--ink-orange)' }} />
          </div>
          <div className="w-28 h-[1px]" style={{ backgroundColor: 'var(--ink-black)' }} />
        </div>

        {/* Location */}
        <div className="text-[34px] tracking-widest mb-3 ink-stamp uppercase rotate-1" style={{ fontFamily: "'Rye', serif", color: 'var(--ink-black)' }}>
          The Garden House
        </div>

        {/* RSVP */}
        <div className="text-6xl mt-5 -rotate-2 ink-stamp" style={{ fontFamily: "'Yellowtail', cursive", color: 'var(--ink-orange)' }}>
          RSVP
        </div>
      </div>

      {/* Lower Left Badge */}
      <div className="absolute bottom-10 left-10 w-[110px] h-[110px] z-20 pointer-events-none -rotate-3">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="var(--paper-bg)" stroke="var(--ink-black)" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--ink-black)" strokeWidth="1" strokeDasharray="4 3" />
          <path d="M 20 20 L 80 80" stroke="var(--ink-black)" strokeWidth="1.2" />
          <path d="M 80 20 L 20 80" stroke="var(--ink-black)" strokeWidth="1.2" />
          
          <text x="50" y="27" fill="var(--ink-black)" fontSize="13" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle" letterSpacing="1">EST</text>
          <text x="50" y="85" fill="var(--ink-black)" fontSize="13" fontFamily="'Bebas Neue', sans-serif" textAnchor="middle" letterSpacing="1">1994</text>
          
          <text x="21" y="56" fill="var(--ink-orange)" fontSize="26" fontFamily="'Rye', serif" textAnchor="middle">C</text>
          <text x="79" y="56" fill="var(--ink-orange)" fontSize="26" fontFamily="'Rye', serif" textAnchor="middle">B</text>
        </svg>
      </div>
      
    </div>
  );
}
