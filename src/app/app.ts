import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { ScreenShareService } from './core/services/screen-share.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class AppComponent {
  readonly loadingService = inject(LoadingService);
  readonly screenService = inject(ScreenShareService);
}
