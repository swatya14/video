import React from "react";

interface TopBarProps {
  hasVideo: boolean;
  onPrimaryAction: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ hasVideo, onPrimaryAction }) => {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[#0B0D11]/95 backdrop-blur-sm border-b border-[#252A36]">
      <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          className="font-display text-lg font-bold tracking-tight text-[#F3F5F8] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded"
        >
          ClearFrame
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9CA3B2]"
        >
          <a
            href="#workspace"
            className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap shrink-0"
          >
            Workspace
          </a>
          <a
            href="#how-it-works"
            className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
          <a
            href="#algorithms"
            className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap shrink-0"
          >
            Algorithms
          </a>
          <a
            href="#faq"
            className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap shrink-0"
          >
            FAQ
          </a>
        </nav>

        {/* Zone 3: Single primary action button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D11]"
          >
            {hasVideo ? "Export Video" : "Upload Video"}
          </button>
        </div>
      </div>
    </header>
  );
};
