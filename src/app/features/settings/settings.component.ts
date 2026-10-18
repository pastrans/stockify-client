import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ExportSettingsComponent } from './export-settings/export-settings.component';
import { LabelSettingsComponent } from './label-settings/label-settings.component';

type SettingsTab = 'export' | 'labels';

// Configuración del sistema con una pestaña por área. La pestaña va en ?tab= para poder enlazarla
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ExportSettingsComponent, LabelSettingsComponent],
  templateUrl: './settings.component.html'
})
export class SettingsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  activeTab = computed<SettingsTab>(() => this.queryParams().get('tab') === 'labels' ? 'labels' : 'export');

  setTab(tab: SettingsTab): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'export' ? null : tab },
      replaceUrl: true
    });
  }
}
