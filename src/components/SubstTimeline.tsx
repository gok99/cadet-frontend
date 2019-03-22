import { generate } from 'astring';
import * as es from 'estree';
import * as React from 'react';

export class SubstTimeline extends React.Component {

  private trees : es.Program[];

  constructor(props : ISubstTimelineProps) {
    super(props);
    this.trees = props.trees;
    this.sliderChanged = this.sliderChanged.bind(this);
    this.setState({value: 0});
  }

  public render() {
    return (
      <div>
        <div>
          {this.trees? 
            this.generateFromTree(this.trees[0]) : "todo"
          }
        </div>
        <input type="range" min="0" max="100" defaultValue="0" onChange={this.sliderChanged}/>
      </div>
    );
  }

  private sliderChanged() {

    
  }

  private generateFromTree(tree : es.Program) : string {
    return generate(tree);
  }
}

export interface ISubstTimelineProps {

  trees : es.Program[]; // todo
}

export default SubstTimeline;