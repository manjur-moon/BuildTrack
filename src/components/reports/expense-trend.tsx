"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
/** Plot relative heights only; exact financial values are rendered separately on the server. */
export function ExpenseTrend({rows}:{rows:readonly {label:string;amount:string}[]}) {
  const max=rows.reduce((m,r)=>{const n=BigInt(r.amount.replace(".",""));return n>m?n:m;},0n);
  const data=rows.map(r=>({month:r.label,height:max===0n?0:Number(BigInt(r.amount.replace(".",""))*10000n/max)/100}));
  return <div aria-hidden="true" style={{width:"100%",minWidth:0}}><BarChart data={data} responsive width="100%" height={260}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis domain={[0,100]} unit="%"/><Bar dataKey="height" fill="#25836b" isAnimationActive={false}/></BarChart></div>;
}
