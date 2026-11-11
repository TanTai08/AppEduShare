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
    d.add_paragraph('Phiên bản 2.0 — cập nhật AI 11/11/2026\nMã nguồn: github.com/TanTai08/AppEduShare').alignment=1
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
                    d.add_paragraph('React Native / Expo  →  REST / Socket.IO  →  PostgreSQL',style='Caption')
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

SLIDES=[('EDUSHARE 2', 'Kết nối sách, trao đổi tri thức', ['Sinh viên: [Họ tên] · Lớp: [Lớp]', 'Giảng viên: [Họ tên]', 'Expo SDK58 · Socket.IO · PostgreSQL']), ('01  Bài toán', 'Hỏi trước khi mua, an tâm khi nhận', ['Tìm sách theo trường, môn và khu vực', 'Trao đổi tình trạng, giá và điểm hẹn', 'Theo dõi giao dịch và tín hiệu uy tín']), ('02  Phạm vi', 'Mua bán · Trao đổi · Nhận sách bằng điểm', ['Tài liệu bản giấy, giao nhận trực tiếp', 'Chat trước mua, ảnh tài liệu và hồ sơ sao', 'FAQ + phiếu hỗ trợ riêng', 'Chưa thu tiền, tải PDF hoặc xác minh sinh viên']), ('03  Công nghệ', 'Một giao diện, API và realtime riêng', ['React Native / Expo SDK58 / TypeScript', 'Express + Socket.IO trên Node24', 'PostgreSQL17, pool và migrations', 'Expo ImagePicker + Sharp, ảnh BYTEA PostgreSQL']), ('04  Kiến trúc', 'REST + sự kiện riêng + PostgreSQL', ['16 bảng nghiệp vụ + schema_migrations', 'Conversations độc lập với transactions', 'Point ledger và tổng số dư nằm trong cùng transaction', 'Sự kiện chỉ phát sau khi commit']), ('05  Giao diện', 'Hộp thư, ví điểm, hồ sơ và hỗ trợ', ['Điều hướng mobile 5 mục, hỗ trợ safe area', 'Lối tắt giao dịch và số dư trên header', 'Ảnh web chạy thật; chưa phải nghiệm thu native']), ('06  Luồng giao dịch', 'Hai xác nhận, một lần thưởng', ['Chat trước khi tạo yêu cầu mua', 'Accept giữ chỗ, free trừ 20 điểm', 'Hai bên xác nhận: sell +10 mỗi bên', 'Hủy trước giao nhận: hoàn điểm đúng một lần']), ('07  Tính nhất quán', 'Không bán trùng, không chi vượt ví', ['Transaction PostgreSQL + khóa nghiệp vụ ngắn', 'Unique ledger và idempotency tin nhắn', 'Cap 30 điểm/ngày, một cặp thưởng 1 lần/24 giờ', 'Chỉ thành viên được chat và đánh giá giao dịch']), ('08  Demo', 'Hai tài khoản, trải nghiệm đầy đủ', ['Nhắn người bán trước mua và thấy trả lời realtime', 'Mua → xác nhận → xem ví → đánh giá', 'Chọn ảnh, đổi bìa, ghi điểm nhận và gửi phiếu', 'Xem KICH_BAN_DEMO.md để thực hành']), ('09  Kiểm thử', 'HTTP, socket và database thật', ['56 tests đạt: 33 server + 23 frontend', 'Kiểm tra ledger, quyền, cạnh tranh và rollback', 'Web và native bundling; browser hai tài khoản', 'Browser kiểm tra đăng/sửa ảnh và gallery']), ('10  Giới hạn & tiếp theo', 'Nghiệm thu trên thiết bị trước vận hành', ['Một Node instance; nhiều instance cần adapter', 'Ảnh BYTEA cần đo tải trước khi mở rộng', 'Chưa email/reset, push, file số hoặc LLM', 'Đo tải, chống gian lận và quy trình tranh chấp']), ('11  Bàn giao', 'github.com/TanTai08/AppEduShare', ['Mã nguồn, PostgreSQL, compose và import SQLite', 'README VS Code/Windows/iPhone, ERD và API', 'Báo cáo Word/Markdown + slide + kiểm thử', 'Cảm ơn thầy cô và các bạn.'])]

SLIDES.insert(10, ('AI  PHÂN LOẠI', 'Gợi ý nhóm, người đăng xác nhận', ['TF-IDF ký tự + Logistic Regression, huấn luyện trên CPU', '480 mẫu tổng hợp; split theo chủ đề 336/72/72', 'Test top1: 63/72, macro-F1=0,8771; chưa phải dữ liệu thực', 'Điểm thấp: chọn thủ công; model chạy ngay trong Node']))

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
            pic=DOCS/'images/v2/home-desktop.png';slide.shapes.add_picture(str(pic),PI(.8),PI(2.45),height=PI(4.4))
            textbox(slide,7.5,2.6,5,4,'\n\n'.join('• '+s for s in bullets),22)
        else:textbox(slide,.85,2.75,11.7,3.9,'\n\n'.join('• '+s for s in bullets),23)
        textbox(slide,.65,7.03,11,.3,'EDUSHARE  /  ĐỒ ÁN SINH VIÊN',10,'69776F')
        textbox(slide,12.1,7.03,.6,.3,str(i+1).zfill(2),10,'69776F')
    prs.save(DOCS/'EduShare_Thuyet_Trinh.pptx')

if __name__=='__main__':
    make_doc();make_slides();print('Generated DOCX and PPTX in docs/.')
