import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveApiAddress} from '../lib/apiAddress.ts';
import {requestJson,ApiError} from '../lib/request.ts';
const runtime={platform:'android',isDevice:false,development:true,metroHost:'192.168.1.169:8081'};
const scenarios=[
 ['Android Emulator tự chọn máy host',{...runtime},'http://10.0.2.2:4000'],
 ['Android sửa mẫu localhost cũ',{...runtime,genericUrl:'http://localhost:4000/'},'http://10.0.2.2:4000'],
 ['Web không gọi địa chỉ máy ảo',{...runtime,platform:'web',browserUrl:'http://localhost:8081',genericUrl:'http://10.0.2.2:4000'},'http://localhost:4000'],
 ['Web mở bằng LAN dùng máy host LAN',{...runtime,platform:'web',browserUrl:'http://192.168.1.169:8081/',genericUrl:'http://localhost:4000'},'http://192.168.1.169:4000'],
 ['iPhone thật tự lấy host Metro',{...runtime,platform:'ios',isDevice:true},'http://192.168.1.169:4000'],
 ['iPhone không dùng localhost cũ',{...runtime,platform:'ios',isDevice:true,genericUrl:'http://localhost:4001'},'http://192.168.1.169:4001'],
 ['Android thật không dùng 10.0.2.2',{...runtime,isDevice:true,genericUrl:'http://10.0.2.2:4000'},'http://192.168.1.169:4000'],
 ['iOS Simulator dùng localhost',{...runtime,platform:'ios'},'http://localhost:4000'],
 ['Override riêng giữ localhost cho adb reverse',{...runtime,platformUrl:'http://localhost:4000'},'http://localhost:4000'],
 ['API HTTPS riêng không bị ghi đè',{...runtime,genericUrl:'https://api.example.com/edushare'},'https://api.example.com/edushare'],
 ['Port tự chọn được giữ',{...runtime,apiPort:'4010'},'http://10.0.2.2:4010'],
 ['URL có /api được chuẩn hóa',{...runtime,genericUrl:'http://localhost:4000/api/'},'http://10.0.2.2:4000'],
 ['Web production cùng origin',{...runtime,development:false,platform:'web',browserUrl:'https://books.example.com/app'},'https://books.example.com'],
 ['Native production không sửa URL tường minh',{...runtime,development:false,genericUrl:'https://api.example.com'},'https://api.example.com'],
];
for(const [label,input,url] of scenarios)test(label,()=>{const result=resolveApiAddress(input);assert.equal(result.error,undefined);assert.equal(result.url,url);});
test('Cấu hình hỏng/nhầm credentials được từ chối, không âm thầm gọi localhost',()=>{
 for(const value of ['postgresql://user:secret@db/edushare','http://user:secret@localhost:4000','http://localhost:4000?token=secret','http\\://localhost:4000','http://localhost:99999']){
  const result=resolveApiAddress({...runtime,genericUrl:value});assert.equal(result.url,'');assert.ok(result.error);assert.equal(result.error.includes('secret'),false);
 }
});
test('Native production, điện thoại không có host và Expo tunnel yêu cầu API riêng',()=>{
 for(const input of [{...runtime,development:false},{...runtime,isDevice:true,metroHost:null},{...runtime,isDevice:true,metroHost:'abcd.exp.direct'}])assert.ok(resolveApiAddress(input).error);
});
test('Thông báo mixed content HTTPS giúp phân biệt cấu hình web',()=>{assert.match(resolveApiAddress({...runtime,platform:'web',browserUrl:'https://books.example.com',genericUrl:'http://api.example.com:4000'}).warnings.join(' '),/mixed content/);});
test('Fetch canceled từ Expo được chuyển thành lỗi mạng có URL health',async()=>{
 await assert.rejects(requestJson('http://10.0.2.2:4000','/auth/login',{fetcher:async()=>{throw new Error('fetch failed: Fetch request has been canceled');}}),error=>{assert.ok(error instanceof ApiError);assert.equal(error.kind,'network');assert.match(error.message,/10\.0\.2\.2:4000\/api\/health/);return true;});
});
test('Timeout được phân biệt dù fetch không ném AbortError',async()=>{
 await assert.rejects(requestJson('http://localhost:4000','/health',{timeoutMs:5,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Fetch request has been canceled'))))}),error=>{assert.equal(error.kind,'timeout');return true;});
});
test('HTTP sai mật khẩu được giữ nguyên, không biến thành lỗi mạng',async()=>{
 await assert.rejects(requestJson('http://localhost:4000','/auth/login',{fetcher:async()=>new Response(JSON.stringify({error:'Email hoặc mật khẩu không đúng.'}),{status:401,headers:{'Content-Type':'application/json'}})}),error=>{assert.equal(error.kind,'http');assert.equal(error.status,401);assert.equal(error.message,'Email hoặc mật khẩu không đúng.');return true;});
});
test('Trỏ nhầm Metro/HTML hoặc JSON hỏng báo lỗi protocol',async()=>{
 for(const response of [new Response('<html>Metro</html>'),new Response('{broken',{headers:{'Content-Type':'application/json'}})])await assert.rejects(requestJson('http://localhost:8081','/health',{fetcher:async()=>response}),error=>error.kind==='protocol');
});
test('Không phát fetch khi URL chưa cấu hình; API thành công gửi đúng token/body',async()=>{
 let called=false;await assert.rejects(requestJson('','/health',{fetcher:async()=>{called=true;throw new Error('Should not fetch');}}),error=>error.kind==='configuration');assert.equal(called,false);
 const result=await requestJson('http://localhost:4000','/auth/login',{method:'POST',body:{email:'test@example.com'},token:'session-token',fetcher:async(url,options)=>{assert.equal(url,'http://localhost:4000/api/auth/login');assert.equal(options.headers.Authorization,'Bearer session-token');assert.equal(options.body,'{"email":"test@example.com"}');return new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}});}});assert.equal(result.ok,true);
});
