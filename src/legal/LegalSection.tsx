import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { LEGAL_DOCUMENTS, type LegalDocument } from './documents';
import './legal.css';

/**
 * The About card's legal rows and their reader.
 *
 * Rendered as rows in the existing settings card rather than as a nested list,
 * so the About section keeps one visual rhythm, and the documents open in the
 * same sheet the rest of the app uses.
 */
export function LegalSection() {
  const [open, setOpen] = useState<LegalDocument | null>(null);

  return (
    <>
      {LEGAL_DOCUMENTS.map((doc) => (
        <button key={doc.id} className="settings-row settings-row--button" onClick={() => setOpen(doc)}>
          <div className="settings-row__body">
            <div className="settings-row__title">{doc.title}</div>
            <div className="settings-row__desc">{doc.summary}</div>
          </div>
          <Icon name="chevronRight" size={18} className="legal-row__chevron" />
        </button>
      ))}

      <BottomSheet
        open={open !== null}
        title={open?.title ?? ''}
        onClose={() => setOpen(null)}
        variant="drawer"
      >
        {open ? (
          <article className="legal-doc">
            <p className="legal-doc__updated">更新日期：{open.updated}</p>
            {open.sections.map((section) => (
              <section key={section.heading} className="legal-doc__section">
                <h3 className="legal-doc__heading">{section.heading}</h3>
                {section.body.map((paragraph, index) => (
                  <p key={index} className="legal-doc__paragraph">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>
        ) : null}
      </BottomSheet>
    </>
  );
}
