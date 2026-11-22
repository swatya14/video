import React from "react";

const ALGORITHMS = [
  {
    name: "Corner Radial",
    bestFor: "Gemini & Veo corner sparkles, channel bugs near edges",
    howItWorks:
      "Detects proximity to frame edges and weights interior clean pixels higher so dark borders never bleed into the reconstructed corner.",
    speed: "60 fps real-time",
  },
  {
    name: "Delogo Smooth",
    bestFor: "Semi-transparent logos, timestamps, and subtitles over smooth backgrounds",
    howItWorks:
      "Bilinear inverse-distance interpolation sampled from clean 4-sided perimeter strips with optional matched film grain.",
    speed: "60 fps real-time",
  },
  {
    name: "Texture Patch",
    bestFor: "Watermarks sitting over ocean waves, foliage, grass, or city detail",
    howItWorks:
      "Clones an adjacent clean interior strip with boundary luminance normalization and cosine edge feathering.",
    speed: "60 fps real-time",
  },
  {
    name: "Soft Blur",
    bestFor: "Fast-moving subjects or high-contrast overlays in complex scenes",
    howItWorks:
      "Two-pass separable box-Gaussian softening confined strictly to the feathered mask footprint.",
    speed: "60 fps real-time",
  },
];

const FAQS = [
  {
    q: "Is there any daily limit, file size cap, or registration required?",
    a: "No. ClearFrame renders directly inside your browser using local Canvas and MediaRecorder pipelines. Because video frames are processed on your device instead of a metered server queue, you can clean unlimited videos without creating an account or hitting paywalls.",
  },
  {
    q: "How do I remove a Gemini or Veo corner sparkle watermark cleanly?",
    a: "Load your video, click the 'Bottom-Right Sparkle' preset (or draw a tight box around the icon), and keep the algorithm on Corner Radial with Edge Feather between 6px and 10px. Use the Before / After split slider to confirm the mark is invisible before exporting.",
  },
  {
    q: "Are my videos uploaded to a cloud server?",
    a: "Your video files stay on your device for playback, mask editing, and full-resolution export. The only optional network request is 'AI Auto-Detect', which sends a single compressed still frame when you explicitly click it to locate watermark coordinates.",
  },
  {
    q: "What if a watermark moves to a different corner mid-video?",
    a: "Add a separate mask for each corner position, then set each mask's Start and End time interval in the right-hand inspector using the 'Set Here' buttons while scrubbing the timeline.",
  },
];

export const GuideSections: React.FC = () => {
  return (
    <div className="border-t border-[#252A36] bg-[#0B0D11]">
      {/* How It Works */}
      <section id="how-it-works" className="max-w-[1440px] mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F5F8] text-balance">
            Clean unlimited videos in three direct steps
          </h2>
          <p className="mt-2 text-sm text-[#9CA3B2] leading-relaxed">
            Built for fast, repeatable post-production cleanup with zero account gates or export watermarks.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="pt-5 border-t border-[#252A36]">
            <h3 className="font-display text-base font-semibold text-[#F3F5F8]">
              01. Load Any Local Video
            </h3>
            <p className="mt-2 text-sm text-[#9CA3B2] leading-relaxed">
              Drop one or multiple MP4, WebM, or MOV files into the workspace queue. Playback opens immediately without waiting for cloud uploads.
            </p>
          </div>

          <div className="pt-5 border-t border-[#252A36]">
            <h3 className="font-display text-base font-semibold text-[#F3F5F8]">
              02. Target the Watermark
            </h3>
            <p className="mt-2 text-sm text-[#9CA3B2] leading-relaxed">
              Click a corner preset, draw directly over the mark, or trigger AI Auto-Detect on the current frame. Drag the Before / After divider while playing to verify the blend.
            </p>
          </div>

          <div className="pt-5 border-t border-[#252A36]">
            <h3 className="font-display text-base font-semibold text-[#F3F5F8]">
              03. Export at Full Resolution
            </h3>
            <p className="mt-2 text-sm text-[#9CA3B2] leading-relaxed">
              Render locally at native video dimensions with original audio preserved. Download instantly in MP4 or WebM with zero branding added.
            </p>
          </div>
        </div>
      </section>

      {/* Algorithms Comparison Table */}
      <section
        id="algorithms"
        className="max-w-[1440px] mx-auto px-6 py-14 border-t border-[#1C202B]"
      >
        <div className="max-w-2xl mb-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F5F8] text-balance">
            Inpainting algorithms tuned for real video footage
          </h2>
          <p className="mt-2 text-sm text-[#9CA3B2] leading-relaxed">
            Every region can use its own removal method, feather radius, and active time range.
          </p>
        </div>

        <div className="overflow-x-auto border border-[#252A36] rounded-xl bg-[#11141B]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#252A36] text-xs font-medium text-[#9CA3B2]">
                <th className="py-3.5 px-5">Algorithm</th>
                <th className="py-3.5 px-5">Best Used For</th>
                <th className="py-3.5 px-5">How It Works</th>
                <th className="py-3.5 px-5 text-right whitespace-nowrap">Preview Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E232E] text-sm">
              {ALGORITHMS.map((alg) => (
                <tr key={alg.name} className="hover:bg-[#171B24]/60 transition-colors">
                  <td className="py-3.5 px-5 font-medium text-[#F3F5F8] whitespace-nowrap">
                    {alg.name}
                  </td>
                  <td className="py-3.5 px-5 text-[#C5CBD6]">{alg.bestFor}</td>
                  <td className="py-3.5 px-5 text-[#9CA3B2]">{alg.howItWorks}</td>
                  <td className="py-3.5 px-5 font-mono text-xs tabular-nums text-[#9CA3B2] text-right whitespace-nowrap">
                    {alg.speed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="max-w-[1440px] mx-auto px-6 py-14 border-t border-[#1C202B]"
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F5F8] mb-8">
          Frequently asked questions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
          {FAQS.map((item) => (
            <div key={item.q} className="space-y-2">
              <h3 className="font-display text-base font-semibold text-[#F3F5F8]">
                {item.q}
              </h3>
              <p className="text-sm text-[#9CA3B2] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[#1C202B]">
        <div className="max-w-[1440px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B7280]">
          <span>ClearFrame — Browser-native video watermark removal</span>
          <span>Free · Unlimited · Local processing · No account required</span>
        </div>
      </footer>
    </div>
  );
};
