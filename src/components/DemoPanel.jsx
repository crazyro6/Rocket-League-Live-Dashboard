import { demo } from '../demo'

// Floating controls to fire the events a real match would produce.
export default function DemoPanel() {
  return (
    <div className="demo-panel">
      <div className="demo-title">Demo mode</div>
      <div className="demo-row">
        <span>New match</span>
        <button onClick={() => demo.newMatch(2)}>1v1</button>
        <button onClick={() => demo.newMatch(4)}>2v2</button>
        <button onClick={() => demo.newMatch(6)}>3v3</button>
      </div>
      <div className="demo-row">
        <button className="blue" onClick={() => demo.goal(0)}>Goal blue</button>
        <button className="orange" onClick={() => demo.goal(1)}>Goal orange</button>
      </div>
      <div className="demo-row">
        <button onClick={() => demo.stat('Save')}>Save</button>
        <button onClick={() => demo.stat('EpicSave')}>Epic save</button>
        <button onClick={() => demo.stat('Demolish')}>Demo</button>
      </div>
      <div className="demo-row">
        <button onClick={demo.end}>End match</button>
        <button onClick={demo.leave}>Leave early</button>
        <a href={location.pathname}>Exit</a>
      </div>
    </div>
  )
}
