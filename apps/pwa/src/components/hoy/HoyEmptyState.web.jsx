// Hoy empty state — shown when the user has no purchased programs yet.
// Full-bleed cinematic photo hero (per STANDARDS §3 background layer system):
// Layer 1 photo, Layer 2 gradient overlay, content anchored editorial bottom-left.
// The CTA color is the accent extracted from the photo at runtime when the bundler
// exposes a URL for it; otherwise it falls back to a clean white CTA. Banners
// (pending invites, session recovery, etc.) render above the hero so a one-on-one
// invitee — who has no programs until they accept — can still act.
import React, { useState } from 'react';
import { Platform, View, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from '../Text';
import { FixedWakeHeader, WakeHeaderContent, WakeHeaderSpacer } from '../WakeHeader';
import BottomSpacer from '../BottomSpacer';
import { useAccentFromImage } from '../../hooks/hoy/useAccentFromImage';
import RestorePurchaseModal from './RestorePurchaseModal.web.jsx';
import heroImage from '../../assets/images/library.jpg';

// Render the photo with RN's <Image> (it resolves the bundled asset internally on
// every platform). For the accent extractor we need a plain URL string — resolve
// one using the same guarded pattern as WakeLoader.web/OnboardingEducation.web
// (Image.resolveAssetSource is not reliably present on web, so it must be guarded).
// null degrades gracefully to a white CTA.
let HERO_ACCENT_URL = null;
try {
  if (typeof heroImage === 'string') HERO_ACCENT_URL = heroImage;
  else if (heroImage && typeof heroImage === 'object' && heroImage.uri) HERO_ACCENT_URL = heroImage.uri;
  else if (heroImage && typeof heroImage === 'object' && heroImage.default) HERO_ACCENT_URL = heroImage.default;
  else if (Image?.resolveAssetSource) {
    const resolved = Image.resolveAssetSource(heroImage);
    if (resolved?.uri) HERO_ACCENT_URL = resolved.uri;
  }
} catch (_) {}

if (typeof document !== 'undefined') {
  const ID = 'hoy-empty-css';
  if (!document.getElementById(ID)) {
    const s = document.createElement('style');
    s.id = ID;
    s.textContent = `
      @keyframes hoyEmptyFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes hoyEmptyUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes hoyCtaPulse { 0%,100% { box-shadow: 0 0 0 0 var(--hoy-cta-glow, rgba(255,255,255,0.4)); } 60% { box-shadow: 0 0 0 14px transparent; } }
    `;
    document.head.appendChild(s);
  }
}

export default function HoyEmptyState({ onExplore, banners, accountEmail }) {
  const [showRestore, setShowRestore] = useState(false);
  const accent = useAccentFromImage(HERO_ACCENT_URL);
  const ctaBg = accent?.accent || 'rgba(255,255,255,0.95)';
  const ctaColor = accent?.accentText || '#1a1a1a';
  const ar = accent?.accentR ?? 255;
  const ag = accent?.accentG ?? 255;
  const ab = accent?.accentB ?? 255;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Layer 1 — photo */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, animation: 'hoyEmptyFade 0.7s ease both' }}>
        <Image source={heroImage} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </div>
      {/* Layer 2 — gradient overlay: keep the photo readable up top, sink into #1a1a1a at the bottom */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.12) 24%, rgba(26,26,26,0.40) 54%, rgba(26,26,26,0.90) 84%, #1a1a1a 100%)',
        }}
      />
      {/* Content */}
      <SafeAreaView
        style={{ flex: 1, backgroundColor: 'transparent', zIndex: 2 }}
        edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}
      >
        <FixedWakeHeader />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <WakeHeaderContent>
            <WakeHeaderSpacer />
            {banners}
            <View style={{ flexGrow: 1, justifyContent: 'flex-end', minHeight: 440, paddingHorizontal: 28, paddingBottom: 8 }}>
              <div style={{ animation: 'hoyEmptyUp 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>
                <Text
                  style={{
                    fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.5,
                    lineHeight: 38, marginBottom: 22,
                    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 24,
                  }}
                >
                  Empieza a entrenar
                </Text>
              </div>
              <div style={{ animation: 'hoyEmptyUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.09s both' }}>
                <button
                  onClick={onExplore}
                  style={{
                    width: '100%', padding: '17px 24px', border: 'none', borderRadius: 14,
                    background: ctaBg, color: ctaColor, fontSize: 16, fontWeight: 700, letterSpacing: '0.02em',
                    cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
                    '--hoy-cta-glow': `rgba(${ar},${ag},${ab},0.45)`,
                    animation: 'hoyCtaPulse 2.6s ease-in-out infinite',
                  }}
                >
                  Explorar programas
                </button>
              </div>
              <div style={{ animation: 'hoyEmptyUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.16s both', marginTop: 16, textAlign: 'center' }}>
                <button
                  onClick={() => setShowRestore(true)}
                  style={{
                    background: 'none', border: 'none', padding: 8, cursor: 'pointer',
                    color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500,
                    fontFamily: 'inherit', textDecoration: 'underline',
                    textDecorationColor: 'rgba(255,255,255,0.25)', textUnderlineOffset: 3,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  ¿Ya compraste y no ves tu programa?
                </button>
              </div>
            </View>
            <BottomSpacer />
          </WakeHeaderContent>
        </ScrollView>
      </SafeAreaView>

      <RestorePurchaseModal
        visible={showRestore}
        onClose={() => setShowRestore(false)}
        accountEmail={accountEmail}
      />
    </div>
  );
}
