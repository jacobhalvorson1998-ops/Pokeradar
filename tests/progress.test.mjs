import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const helper=new URL('../scripts/save-progress.sh',import.meta.url).pathname;
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeradar-save-')),remote=path.join(root,'remote.git'),worker=path.join(root,'worker'),editor=path.join(root,'editor');fs.mkdirSync(remote);git(remote,'init','--bare','--initial-branch=main');git(root,'clone','--quiet',remote,worker);git(worker,'config','user.name','Test');git(worker,'config','user.email','test@example.invalid');
 for(const dir of ['data','site','scripts'])fs.mkdirSync(path.join(worker,dir));
 fs.writeFileSync(path.join(worker,'data/progress.json'),'17\n');fs.writeFileSync(path.join(worker,'site/catalog.json'),'{}\n');fs.writeFileSync(path.join(worker,'site/prices.json'),'{}\n');fs.writeFileSync(path.join(worker,'scripts/model.txt'),'1');
 fs.writeFileSync(path.join(worker,'scripts/backtest.mjs'),'// archive evaluation fixture\n');fs.writeFileSync(path.join(worker,'scripts/build.mjs'),"import fs from 'node:fs';fs.writeFileSync('site/summary.json',JSON.stringify({model:Number(fs.readFileSync('scripts/model.txt')),progress:Number(fs.readFileSync('data/progress.json'))}));");fs.writeFileSync(path.join(worker,'scripts/verify-site.mjs'),"import fs from 'node:fs';const s=JSON.parse(fs.readFileSync('site/summary.json'));if(s.model!==Number(fs.readFileSync('scripts/model.txt')))throw Error('stale model');");fs.writeFileSync(path.join(worker,'site/summary.json'),'{"model":1,"progress":17}');git(worker,'add','.');git(worker,'commit','--quiet','-m','Initial');git(worker,'push','--quiet','origin','HEAD:main');git(root,'clone','--quiet',remote,editor);git(editor,'config','user.name','Test');git(editor,'config','user.email','test@example.invalid');return {root,remote,worker,editor};
}
test('an in-flight updater keeps raw progress and rebuilds against concurrent model changes',()=>{
 const {root,remote,worker,editor}=fixture();try{
  fs.writeFileSync(path.join(editor,'scripts/model.txt'),'2');fs.writeFileSync(path.join(editor,'site/summary.json'),'{"model":2,"progress":17}');git(editor,'add','.');git(editor,'commit','--quiet','-m','New model');git(editor,'push','--quiet','origin','HEAD:main');
  fs.writeFileSync(path.join(worker,'data/progress.json'),'42\n');fs.writeFileSync(path.join(worker,'site/summary.json'),'{"model":1,"progress":42}');
  const result=spawnSync('bash',[helper],{cwd:worker,env:{...process.env,POKERADAR_PROGRESS_TEST:'1',GITHUB_RUN_ID:'safe-merge'},encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
  assert.equal(git(remote,'show','main:scripts/model.txt'),'2');assert.equal(git(remote,'show','main:data/progress.json'),'42');assert.deepEqual(JSON.parse(git(remote,'show','main:site/summary.json')),{model:2,progress:42});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('conflicting manual data edits remain on main and updater progress gets a recoverable branch',()=>{
 const {root,remote,worker,editor}=fixture();try{
  fs.writeFileSync(path.join(editor,'data/progress.json'),'100\n');git(editor,'add','.');git(editor,'commit','--quiet','-m','Manual data correction');git(editor,'push','--quiet','origin','HEAD:main');
  fs.writeFileSync(path.join(worker,'data/progress.json'),'42\n');
  const result=spawnSync('bash',[helper],{cwd:worker,env:{...process.env,POKERADAR_PROGRESS_TEST:'1',GITHUB_RUN_ID:'raw-conflict'},encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(git(remote,'show','main:data/progress.json'),'100');assert.equal(git(remote,'show','pokeradar-progress-raw-conflict:data/progress.json'),'42');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
