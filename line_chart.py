import streamlit as st
import os
from streamlit_echarts import st_echarts
import json

st.set_page_config(layout="wide")

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

tools_path = './tools'
line_path = os.path.join(tools_path, 'line_chart')

ttl_duration = 60 * 60 * 24 + 60 * 10  # 24 hours + 10 minutes in seconds


# 主程序
def main():
    add_logo(os.path.join(tools_path, 'logo_base64.txt'))

    category_name = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
        index=0  # 将默认值设置为'power'
    )

    option, ROWS_PER_GRID, PLOT_HEIGHT = get_configuration_for_category(category_name)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")


@st.cache_data(ttl=ttl_duration)
def load_base64_file(base64_file):
    with open(base64_file, "r") as f:
        b64_string = f.read()
    return b64_string


def add_logo(base64_file):
    b64_string = load_base64_file(base64_file)

    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;
                padding-top: 40px;
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )


# @st.cache_data(ttl=ttl_duration)
def get_configuration_for_category(category):
    with open(os.path.join(line_path, f"{category}.json"), "r") as file:
        data = json.load(file)
    return data["option"], data["ROWS_PER_GRID"], data["PLOT_HEIGHT"]


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
