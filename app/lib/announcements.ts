// Define a type for announcements
export interface Announcement {
  id: string;
  message: string;
  link?: string;
  isNew?: boolean;
  expireDate?: Date; // Optional expiration date
}

// Default announcements array
export const defaultAnnouncements: Announcement[] = [
  {
    id: 'ux-ui-clone',
    message: 'UX/UI Cloning Feature Available',
    link: 'https://www.instagram.com/toddyclipsgg/',
    isNew: true,
    expireDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  },
  {
    id: 'extended-files',
    message: 'Introducing Extended Files to Codezen',
    link: 'https://www.instagram.com/toddyclipsgg/',
    isNew: true,
    expireDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  },
];

// Função para embaralhar uma matriz (algoritmo Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// Helper functions for announcement management
export function getActiveAnnouncements(): Announcement[] {
  // Filtra anúncios ativos
  const activeAnnouncements = defaultAnnouncements.filter((announcement) => {
    // Filter out expired announcements
    if (announcement.expireDate && new Date() > announcement.expireDate) {
      return false;
    }

    // Check localStorage to see if user dismissed this announcement
    const dismissedAnnouncements = getDismissedAnnouncements();

    if (dismissedAnnouncements.includes(announcement.id)) {
      return false;
    }

    return true;
  });

  // Retorna os anúncios em ordem aleatória
  return shuffleArray(activeAnnouncements);
}

// Get dismissed announcements from localStorage
export function getDismissedAnnouncements(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const dismissed = localStorage.getItem('codezen_dismissed_announcements');

  return dismissed ? JSON.parse(dismissed) : [];
}

// Dismiss an announcement
export function dismissAnnouncement(id: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const dismissed = getDismissedAnnouncements();

  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem('codezen_dismissed_announcements', JSON.stringify(dismissed));
  }
}
