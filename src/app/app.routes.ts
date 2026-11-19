import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home-overview/home-overview.component').then((m) => m.HomeOverviewComponent),
    title: 'Overview - Beatium Lite (Academic Engine)',
    pathMatch: 'full',
  },
  {
    path: 'overview',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'voice',
    loadComponent: () =>
      import('./pages/voice-lab/voice-lab.component').then((m) => m.VoiceLabComponent),
    title: 'Voice Lab - Beatium',
  },
  {
    path: 'image',
    loadComponent: () =>
      import('./pages/image-lab/image-lab.component').then((m) => m.ImageLabComponent),
    title: 'Image Lab - Beatium',
  },
  {
    path: 'videos',
    loadComponent: () =>
      import('./pages/videos-lab/videos-lab.component').then((m) => m.VideosLabComponent),
    title: 'Videos Lab - Beatium',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
