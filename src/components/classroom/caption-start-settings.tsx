'use client';
import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';
import { CaptionSelect } from './caption-select';
import { captionLanguageSelectOptions, classroomLanguageLabel } from '@/lib/classroom/languages';
import { type CaptionStartPreferences } from '@/lib/classroom/caption-start-preferences';
import styles from './caption-start-settings.module.css';

export function CaptionStartSettings({ value, disabled = false, className = '', onChange }: {
  value: CaptionStartPreferences; disabled?: boolean; className?: string; onChange: (value: CaptionStartPreferences) => void;
}) {
  const { t, locale } = useTranslation();
  const [adding, setAdding] = useState(false);
  const sources = captionLanguageSelectOptions('shengwang', locale);
  // Course defaults use the built-in provider's supported languages. Extra
  // bridge languages remain available in the live, capability-aware selector.
  const targets = sources.filter(option => option.value !== value.sourceLanguage && !value.targetLanguages.includes(option.value));
  return <section className={`${styles.settings} ${className}`} aria-label={t('captionStart.title')}>
    <h3>{t('captionStart.title')}</h3>
    {(['autoCaptions', 'autoInterpretation'] as const).map(key => <div className={styles.row} key={key}>
      <label id={`caption-start-${key}`}>{t(`captionStart.${key}`)}</label>
      <button type="button" role="switch" aria-labelledby={`caption-start-${key}`} aria-checked={value[key]} disabled={disabled}
        onClick={() => onChange({ ...value, [key]: !value[key] })}><i /></button>
    </div>)}
    {(value.autoCaptions || value.autoInterpretation) && <div className={styles.languages}>
      <CaptionSelect label={t('classroom.v3.sourceLanguage')} value={value.sourceLanguage} options={sources} searchable disabled={disabled}
        onChange={sourceLanguage => {
          const remaining = value.targetLanguages.filter(code => code !== sourceLanguage);
          const fallback = sources.find(option => option.value !== sourceLanguage)?.value;
          onChange({ ...value, sourceLanguage, targetLanguages: remaining.length ? remaining : fallback ? [fallback] : [] });
        }} />
      {value.autoInterpretation && <div className={styles.targets}>
        <span>{t('captionStart.languages')}</span>
        <div className={styles.chips}>
          {value.targetLanguages.map(code => <span className={styles.chip} key={code}>{classroomLanguageLabel(code, locale)}
            <button type="button" disabled={disabled || value.targetLanguages.length === 1} aria-label={`${t('common.delete')} ${classroomLanguageLabel(code, locale)}`}
              onClick={() => onChange({ ...value, targetLanguages: value.targetLanguages.filter(item => item !== code) })}><X /></button></span>)}
          <button type="button" className={styles.add} disabled={disabled || targets.length === 0 || value.targetLanguages.length >= 10}
            aria-expanded={adding} onClick={() => setAdding(current => !current)}><Plus />{t('captionStart.addLanguage')}</button>
        </div>
        {adding && <CaptionSelect label={t('captionStart.addLanguage')} value="" options={targets} searchable disabled={disabled}
          onChange={code => { onChange({ ...value, targetLanguages: [...value.targetLanguages, code] }); setAdding(false); }} />}
        {value.targetLanguages.length === 0 && <p role="alert">{t('captionStart.chooseLanguage')}</p>}
      </div>}
    </div>}
    <p className={styles.hint}><Check aria-hidden="true" />{t('captionStart.hint')}</p>
  </section>;
}
