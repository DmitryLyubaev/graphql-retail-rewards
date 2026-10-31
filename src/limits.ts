import {getOperationAST,Kind,type DocumentNode,type SelectionSetNode,type FragmentDefinitionNode} from 'graphql';
export function validateOperation(document:DocumentNode,operationName?:string):void {
  const operation=getOperationAST(document,operationName);if(!operation||operation.operation==='subscription')throw new Error('Unsupported operation');
  const fragments=new Map(document.definitions.filter((n):n is FragmentDefinitionNode=>n.kind===Kind.FRAGMENT_DEFINITION).map(n=>[n.name.value,n]));
  let fields=0,roots=0;
  function walk(set:SelectionSetNode,depth:number,stack:Set<string>):void {
    for(const node of set.selections){
      if(node.kind===Kind.FIELD){
        if(++fields>40||depth+1>6||node.name.value==='__schema'||node.name.value==='__type')throw new Error('Query work limit');
        if(depth===0&&++roots>1)throw new Error('One root field required');
        if(node.selectionSet)walk(node.selectionSet,depth+1,stack);
      }else if(node.kind===Kind.INLINE_FRAGMENT)walk(node.selectionSet,depth,stack);
      else {const name=node.name.value;if(stack.has(name)||!fragments.has(name))throw new Error('Invalid fragment');walk(fragments.get(name)!.selectionSet,depth,new Set([...stack,name]));}
    }
  }
  walk(operation.selectionSet,0,new Set());
}
