import { atom } from 'nanostores';

// Store para controlar a visibilidade do anúncio
export const announcementVisibilityStore = {
  // Visibilidade global do anúncio
  showAnnouncement: atom<boolean>(true),

  // Ocultar anúncio
  hideAnnouncement: () => {
    announcementVisibilityStore.showAnnouncement.set(false);
  },

  // Mostrar anúncio
  showAnnouncementAgain: () => {
    announcementVisibilityStore.showAnnouncement.set(true);
  },
};
