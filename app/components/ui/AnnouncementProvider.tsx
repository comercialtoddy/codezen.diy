import React, { createContext, useContext, useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { Announcement as AnnouncementComponent } from './Announcement';
import {
  type Announcement,
  getActiveAnnouncements,
  dismissAnnouncement as dismissAnnouncementUtil,
} from '~/lib/announcements';
import { workbenchStore } from '~/lib/stores/workbench';
import { announcementVisibilityStore } from '~/lib/stores/announcement';

interface AnnouncementContextType {
  announcements: Announcement[];
  addAnnouncement: (announcement: Omit<Announcement, 'id'>) => void;
  removeAnnouncement: (id: string) => void;
}

const AnnouncementContext = createContext<AnnouncementContextType | undefined>(undefined);

export const useAnnouncements = () => {
  const context = useContext(AnnouncementContext);

  if (!context) {
    throw new Error('useAnnouncements must be used within an AnnouncementProvider');
  }

  return context;
};

export const AnnouncementProvider = ({ children }: { children: React.ReactNode }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const showAnnouncement = useStore(announcementVisibilityStore.showAnnouncement);

  useEffect(() => {
    // Load active announcements on client-side
    if (typeof window !== 'undefined') {
      setAnnouncements(getActiveAnnouncements());
    }
  }, []);

  const addAnnouncement = (announcement: Omit<Announcement, 'id'>) => {
    const id = `announcement-${Date.now()}`;
    setAnnouncements((prev) => [...prev, { ...announcement, id }]);
  };

  const removeAnnouncement = (id: string) => {
    dismissAnnouncementUtil(id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const currentAnnouncement = announcements.length > 0 ? announcements[0] : null;

  return (
    <AnnouncementContext.Provider value={{ announcements, addAnnouncement, removeAnnouncement }}>
      {children}
      {currentAnnouncement && !showWorkbench && showAnnouncement && (
        <AnnouncementComponent
          id={currentAnnouncement.id}
          message={currentAnnouncement.message}
          link={currentAnnouncement.link}
          isNew={currentAnnouncement.isNew}
        />
      )}
    </AnnouncementContext.Provider>
  );
};
