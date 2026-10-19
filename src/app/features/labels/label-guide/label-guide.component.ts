import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LabelTemplate } from '../../../shared/models/label-template.model';
import { LabelTemplateService } from '../../../core/services/label-template.service';
import { LabelaryService } from '../../../core/services/labelary.service';
import { LABEL_PLACEHOLDER_HELP, renderLabel, sampleLabelItem, splitTemplate } from '../../../shared/utils/zpl';

type GuideTab = 'printer' | 'templates';

interface TemplateExample {
  template: LabelTemplate;
  previewUrl: string | null;
}

// Guías estáticas de impresión de etiquetas (US-L7). La pestaña va en ?tab= para poder enlazarla
@Component({
  selector: 'app-label-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './label-guide.component.html',
  styleUrls: ['./label-guide.component.css']
})
export class LabelGuideComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly labelTemplateService = inject(LabelTemplateService);
  private readonly labelary = inject(LabelaryService);

  readonly placeholderHelp = LABEL_PLACEHOLDER_HELP;
  readonly isHttps = location.protocol === 'https:';

  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  activeTab = computed<GuideTab>(() => this.queryParams().get('tab') === 'templates' ? 'templates' : 'printer');

  // Plantillas activas como ejemplo, con su vista previa (datos de ejemplo)
  examples = signal<TemplateExample[]>([]);
  private examplesLoaded = false;

  ngOnInit(): void {
    if (this.activeTab() === 'templates') this.loadExamples();
  }

  ngOnDestroy(): void {
    this.examples().forEach(example => example.previewUrl && URL.revokeObjectURL(example.previewUrl));
  }

  setTab(tab: GuideTab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'printer' ? null : tab }, replaceUrl: true });
    if (tab === 'templates') this.loadExamples();
  }

  private loadExamples(): void {
    if (this.examplesLoaded) return;
    this.examplesLoaded = true;

    this.labelTemplateService.getTemplates(1, 6, { available: 'true' }).subscribe({
      next: async (res) => {
        const templates = res.data ?? [];
        this.examples.set(templates.map(template => ({ template, previewUrl: null })));
        // Una a una: Labelary limita la frecuencia de peticiones
        for (const template of templates) {
          try {
            const { item, context } = sampleLabelItem(template.zpl, 'Mi tienda');
            const label = renderLabel(splitTemplate(template.zpl).label, item.product, item.variant, context);
            const url = await this.labelary.preview(label, template.widthMm, template.heightMm, 203);
            this.examples.update(list => list.map(e => e.template.id === template.id ? { ...e, previewUrl: url } : e));
          } catch {
            // Sin vista previa: se muestra solo el nombre y el enlace al editor
          }
        }
      },
      error: () => this.examples.set([])
    });
  }
}
