import { demo } from '../demo'
import { t } from '../i18n'

// Floating controls to fire the events a real match would produce.
export default function DemoPanel() {
  return (
    <div className="demo-panel">
      <div className="demo-title">{t('demo.title')}</div>
      <div className="demo-row">
        <span>{t('demo.newMatch')}</span>
        <button onClick={() => demo.newMatch(2)}>1v1</button>
        <button onClick={() => demo.newMatch(4)}>2v2</button>
        <button onClick={() => demo.newMatch(6)}>3v3</button>
      </div>
      <div className="demo-row">
        <button className="blue" onClick={() => demo.goal(0)}>{t('demo.goalBlue')}</button>
        <button className="orange" onClick={() => demo.goal(1)}>{t('demo.goalOrange')}</button>
      </div>
      <div className="demo-row">
        <button onClick={() => demo.stat('Save')}>{t('demo.save')}</button>
        <button onClick={() => demo.stat('EpicSave')}>{t('demo.epicSave')}</button>
        <button onClick={() => demo.stat('Demolish')}>{t('demo.demo')}</button>
      </div>
      <div className="demo-row">
        <button onClick={demo.end}>{t('demo.end')}</button>
        <button onClick={demo.leave}>{t('demo.leave')}</button>
        <a href={location.pathname}>{t('demo.exit')}</a>
      </div>
    </div>
  )
}
