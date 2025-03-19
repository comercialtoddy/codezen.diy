import { useState } from 'react';
import { useAnnouncements } from './AnnouncementProvider';

interface AnnouncementProps {
  message: string;
  link?: string;
  isNew?: boolean;
  id?: string;
}

export const Announcement = ({ message, link, isNew = true, id }: AnnouncementProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const announcementContext = useAnnouncements();

  if (!isVisible) {
    return null;
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation(); // Impede que o clique no botão fechar ative o link
    setIsVisible(false);

    if (id && announcementContext) {
      announcementContext.removeAnnouncement(id);
    }
  };

  const handleAnnouncementClick = () => {
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed top-[5%] left-0 right-0 flex justify-center p-2 z-50">
      <div
        className="flex items-center gap-3 px-4 py-1.5 bg-green-900/90 backdrop-blur-sm rounded-md shadow-md text-white max-w-max cursor-pointer hover:bg-green-800/90 transition-colors"
        onClick={handleAnnouncementClick}
      >
        {isNew && <span className="text-xs font-semibold bg-green-700 text-white px-2 py-0.5 rounded-md">New</span>}
        <span className="text-sm font-medium">{message}</span>
        {link && <span className="text-xs font-medium text-white/90">→</span>}
        <button
          onClick={handleClose}
          className="ml-1 text-white/70 hover:text-white transition-colors bg-transparent"
          aria-label="Close announcement"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="bg-transparent"
          >
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
