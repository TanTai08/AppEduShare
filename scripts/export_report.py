"""Generate editable DOCX/PPTX from the report and real screenshots.
Install: python -m pip install -r scripts/requirements-docs.txt
Run at repository root: python scripts/export_report.py
"""
from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from pptx import Presentation
from pptx.util import Inches as PI, Pt as PP
from pptx.dml.color import RGBColor as PC
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DOCS=ROOT/'docs'
GREEN='174D3C'

def clean(s):
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1 (\2)',s)
    return s.replace('**','').replace('`','')

def table(doc,rows):
    rows=[r for r in rows if not re.match(r'^\|\s*:?-',r)]
    values=[[clean(v.strip()) for v in r.strip().strip('|').split('|')] for r in rows]
    if not values:return
    t=doc.add_table(rows=0,cols=len(values[0]));t.style='Light Shading Accent 1'
    for row in values:
        cells=t.add_row().cells
        for cell,value in zip(cells,row):
            cell.text=value
            for p in cell.paragraphs:
                for run in p.runs:run.font.size=Pt(11)
    doc.add_paragraph()

def make_doc():
    d=Document();sec=d.sections[0]
    sec.top_margin=Cm(2.2);sec.bottom_margin=Cm(2);sec.left_margin=Cm(3);sec.right_margin=Cm(2)
    sec.page_width=Cm(21);sec.page_height=Cm(29.7)
    normal=d.styles['Normal'];normal.font.name='Times New Roman';normal.font.size=Pt(13)
    normal.paragraph_format.line_spacing=1.25;normal.paragraph_format.space_after=Pt(7)
    for name,size in [('Title',23),('Heading 1',17),('Heading 2',14),('Heading 3',13)]:
        style=d.styles[name];style.font.name='Times New Roman';style.font.size=Pt(size);style.font.color.rgb=RGBColor.from_string(GREEN)
    d.add_paragraph('[TÊN TRƯỜNG / KHOA]',style='Subtitle').alignment=1
    d.add_paragraph('\nBÁO CÁO ĐỒ ÁN',style='Title').alignment=1
    d.add_paragraph('EDUSHARE',style='Title').alignment=1
    p=d.add_paragraph('XÂY DỰNG ỨNG DỤNG ĐA NỀN TẢNG\nHỖ TRỢ MUA BÁN VÀ TRAO ĐỔI\nTÀI LIỆU HỌC TẬP CHO SINH VIÊN\nTRONG KHU VỰC',style='Heading 1');p.alignment=1
    d.add_paragraph('\nSinh viên: [Họ tên]\nMã sinh viên: [Mã sinh viên]\nLớp: [Lớp]\nGiảng viên hướng dẫn: [Họ tên]\nHọc phần: [Học phần]\nNăm học: [Năm học]')
    d.add_paragraph('Phiên bản 1.0 — 10/11/2026\nMã nguồn: github.com/TanTai08/AppEduShare').alignment=1
    d.add_page_break()
    h=sec.header.paragraphs[0];h.text='EDUSHARE  |  ĐỒ ÁN ỨNG DỤNG ĐA NỀN TẢNG';h.style=d.styles['Caption']
    footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run('Trang ');fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');footer._p.append(fld)
    lines=(DOCS/'BAO_CAO_DO_AN.md').read_text().splitlines()
    started=False;code=False;lang='';code_lines=[];rows=[]
    for line in lines:
        if not started:
            if line.startswith('## TÓM TẮT'):started=True
            else:continue
        if line.startswith('```'):
            if not code:code=True;lang=line[3:];code_lines=[]
            else:
                code=False
                if lang=='mermaid':
                    d.add_paragraph('React Native / Expo  →  REST API Express  →  SQLite',style='Caption')
                    d.add_paragraph('Sơ đồ nguồn có thể xem trực tiếp trên GitHub trong báo cáo Markdown và tài liệu cơ sở dữ liệu.',style='Caption')
                else:
                    p=d.add_paragraph('\n'.join(code_lines));p.style='No Spacing'
                    for r in p.runs:r.font.name='Consolas';r.font.size=Pt(10)
            continue
        if code:code_lines.append(line);continue
        if line.startswith('|'):rows.append(line);continue
        if rows:table(d,rows);rows=[]
        if not line.strip():continue
        image=re.match(r'!\[([^]]*)\]\(([^)]+)\)',line)
        if image:
            path=DOCS/image.group(2)
            if path.exists():
                with Image.open(path) as im:w,h=im.size
                scale=min(6.1/w,7.5/h)
                d.add_picture(str(path),width=Inches(w*scale))
                d.add_paragraph(image.group(1),style='Caption')
            continue
        if line.startswith('## '):
            title=clean(line[3:])
            if title.startswith(('CHƯƠNG','TÀI LIỆU THAM KHẢO','PHỤ LỤC')):d.add_page_break()
            d.add_heading(title,1)
        elif line.startswith('### '):d.add_heading(clean(line[4:]),2)
        elif line.startswith('- '):d.add_paragraph(clean(line[2:]),style='List Bullet')
        elif re.match(r'^\d+\. ',line):d.add_paragraph(clean(re.sub(r'^\d+\. ','',line)),style='List Number')
        elif line.startswith('# '):d.add_heading(clean(line[2:]),1)
        else:
            p=d.add_paragraph(clean(line));p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    if rows:table(d,rows)
    d.core_properties.title='EduShare — Báo cáo đồ án';d.core_properties.subject='Ứng dụng mua bán và trao đổi tài liệu học tập'
    d.save(DOCS/'EduShare_Bao_Cao_Do_An.docx')

SLIDES=[
 ('EDUSHARE','Ứng dụng đa nền tảng mua bán và trao đổi tài liệu học tập', ['Sinh viên: [Họ tên] · Lớp: [Lớp]','Giảng viên: [Họ tên]','React Native / Expo · Node.js · SQLite']),
 ('01  Bài toán','Tài liệu đã dùng vẫn còn giá trị', ['Tin đăng phân tán, khó tìm đúng môn và khu vực','Nhiều người có thể hỏi cùng một cuốn sách','Cần trạng thái giao dịch, lịch sử trao đổi và đánh giá']),
 ('02  Mục tiêu & phạm vi','Kết nối sinh viên quanh trường', ['Mua bán · Đổi 1–1 · Tặng tài liệu bản giấy','Tìm theo tên, môn học, trường và khu vực','Giao nhận trực tiếp; không thu tiền trong ứng dụng','Chưa bán PDF, chưa xác minh email hoặc phát hành native']),
 ('03  Công nghệ','Một mã nguồn giao diện, API riêng', ['React Native + Expo + TypeScript','Node.js 24 / Express + Zod','SQLite: khóa ngoại, index và transaction','GitHub Actions: kiểm tra và build tự động']),
 ('04  Kiến trúc & dữ liệu','Giao diện → REST API → SQLite', ['9 bảng: users, sessions, listings, favorites, transactions, messages, reviews, reports, notifications','Client không truy cập trực tiếp database','Token phiên có hạn dùng; kiểm tra quyền ở API']),
 ('05  Giao diện','Web desktop và mobile web', ['Giao diện tiếng Việt, lọc theo trường/khu vực','Sidebar desktop, thanh điều hướng trên màn hình hẹp','Ảnh từ ứng dụng chạy thật; không phải chứng nhận native']),
 ('06  Vòng đời giao dịch','Pending → Accepted → Completed', ['Người đăng chấp nhận và hệ thống giữ chỗ','Hai bên nhắn tin, thống nhất giao nhận','Chỉ hoàn thành khi cả hai xác nhận','Hủy trước hoàn thành giải phóng tài liệu']),
 ('07  Tính nhất quán & quyền','Ngăn hai giao dịch giữ cùng tài liệu', ['BEGIN IMMEDIATE: kiểm tra + giữ chỗ trong một transaction','Đổi tài liệu giữ chỗ cả hai phía','Người ngoài không đọc được chat','Admin ẩn tin khóa tự hiện lại và hủy giao dịch mở']),
 ('08  Demo mua tài liệu','Hai tài khoản, một quy trình hoàn chỉnh', ['Minh Anh gửi yêu cầu, Hoàng Nam chấp nhận','Nhắn tin hẹn địa điểm công cộng','Xác nhận hai phía, đánh giá sau hoàn thành','Xem KICH_BAN_DEMO.md để thực hành']),
 ('09  Kiểm thử','Kiểm chứng bằng lệnh và trình duyệt', ['11/11 nhóm test HTTP API đạt','TypeScript và Expo web export đạt','Browser hai phiên: mua, chat, hoàn thành và đánh giá','Chưa đo tải lớn hoặc kiểm thử Android/iOS trên thiết bị']),
 ('10  Giới hạn & phát triển','Từ MVP đến sản phẩm vận hành', ['Ưu tiên: native, ảnh thật, email và audit log','Phân trang, tìm kiếm không dấu và danh mục chuẩn','PostgreSQL, WebSocket và thông báo đẩy khi mở rộng','Rà soát dependency; chưa sẵn sàng vận hành công khai']),
 ('11  Bàn giao','github.com/TanTai08/AppEduShare', ['Mã nguồn + SQL + dữ liệu demo','README chạy bằng Visual Studio Code','Báo cáo Word/Markdown + slide + kịch bản bảo vệ','Cảm ơn thầy cô và các bạn.']),
]
def textbox(slide,x,y,w,h,text,size=22,color='172F26',bold=False):
    box=slide.shapes.add_textbox(PI(x),PI(y),PI(w),PI(h));frame=box.text_frame;frame.word_wrap=True
    for i,line in enumerate(text.split('\n')):
        p=frame.paragraphs[0] if i==0 else frame.add_paragraph();p.text=line;p.font.name='Arial';p.font.size=PP(size);p.font.bold=bold;p.font.color.rgb=PC.from_string(color)
    return box

def make_slides():
    prs=Presentation();prs.slide_width=PI(13.333);prs.slide_height=PI(7.5)
    for i,(tag,title,bullets) in enumerate(SLIDES):
        slide=prs.slides.add_slide(prs.slide_layouts[6]);slide.background.fill.solid();slide.background.fill.fore_color.rgb=PC.from_string('F6F7F2')
        bar=slide.shapes.add_shape(1,0,0,PI(.18),prs.slide_height);bar.fill.solid();bar.fill.fore_color.rgb=PC.from_string(GREEN);bar.line.fill.background()
        textbox(slide,.65,.45,12,.5,tag,15,GREEN,True)
        textbox(slide,.65,1.15,12,1.35,title,34,GREEN,True)
        if i==5:
            pic=DOCS/'images/trang-chu-desktop.png';slide.shapes.add_picture(str(pic),PI(.8),PI(2.45),height=PI(4.4))
            textbox(slide,7.5,2.6,5,4,'\n\n'.join('• '+s for s in bullets),22)
        else:textbox(slide,.85,2.75,11.7,3.9,'\n\n'.join('• '+s for s in bullets),23)
        textbox(slide,.65,7.03,11,.3,'EDUSHARE  /  ĐỒ ÁN SINH VIÊN',10,'69776F')
        textbox(slide,12.1,7.03,.6,.3,str(i+1).zfill(2),10,'69776F')
    prs.save(DOCS/'EduShare_Thuyet_Trinh.pptx')

if __name__=='__main__':
    make_doc();make_slides();print('Generated DOCX and PPTX in docs/.')
